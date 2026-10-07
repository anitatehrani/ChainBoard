'use strict';

// Drives the REAL chaincode (pm-chaincode/index.js) on an in-memory stub.
// These tests are about what the LEDGER guarantees, independent of the backend.

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MockLedger } = require('./helpers/mockLedger');

let clock;
let ledger;
beforeEach(() => {
    clock = { s: 1_760_000_000 };
    ledger = new MockLedger({ clock: () => clock.s });
});

function register(o = {}) {
    return ledger.submit(
        'registerUser',
        o.email ?? 'ann@example.com',
        o.name ?? 'Ann Lee',
        o.username ?? 'ann.lee',
        o.phone ?? '',
        o.hash ?? 'scrypt$32768$8$1$c2FsdA==$a2V5',
        o.provider ?? 'email',
        o.googleId ?? '',
        o.picture ?? '',
        o.verified ?? 'false'
    );
}

describe('registerUser', () => {
    test('creates the user, stamps createdAt from the transaction time, and writes index keys', async () => {
        const user = await register({ phone: '+491701234567' });
        assert.equal(user.email, 'ann@example.com');
        assert.equal(user.username, 'ann.lee');
        assert.equal(user.createdAt, new Date(clock.s * 1000).toISOString());
        assert.equal(user.emailVerifiedAt, '');
        assert.deepEqual(user.projectIds, []);
        assert.equal(ledger.peek('idx:username:ann.lee'), 'ann@example.com');
        assert.equal(ledger.peek('idx:phone:+491701234567'), 'ann@example.com');
    });

    test('lower-cases email and username, ignores a leading @', async () => {
        const user = await register({ email: '  ANN@Example.COM ', username: '@Ann.Lee' });
        assert.equal(user.email, 'ann@example.com');
        assert.equal(user.username, 'ann.lee');
    });

    test('a Google account can be created already verified', async () => {
        const user = await register({ provider: 'google', hash: '', googleId: 'g-1', picture: 'http://p', verified: 'true' });
        assert.ok(user.emailVerifiedAt);
        assert.equal(user.googleId, 'g-1');
        assert.deepEqual(user.authProviders, ['google']);
        assert.equal(ledger.peek('idx:google:g-1'), 'ann@example.com');
    });

    test('rejects a duplicate email in any casing', async () => {
        await register();
        await assert.rejects(register({ email: 'ANN@example.com', username: 'other.name' }), /already exists/);
    });

    test('rejects a duplicate username in any casing and leaves NO partial state', async () => {
        await register();
        await assert.rejects(register({ email: 'bob@example.com', username: 'ANN.LEE' }), /already taken/);
        assert.equal(ledger.peek('user:bob@example.com'), null);
    });

    test('rejects a duplicate phone number', async () => {
        await register({ phone: '+491701234567' });
        await assert.rejects(
            register({ email: 'bob@example.com', username: 'bob.b', phone: '+491701234567' }),
            /phone number is already used/
        );
        assert.equal(ledger.peek('user:bob@example.com'), null);
    });

    test('rejects a Google id already linked to someone else', async () => {
        await register({ provider: 'google', hash: '', googleId: 'g-1' });
        await assert.rejects(
            register({ email: 'bob@example.com', username: 'bob.b', provider: 'google', hash: '', googleId: 'g-1' }),
            /already linked/
        );
    });

    test('rejects invalid usernames', async () => {
        for (const bad of ['ab', 'a..b', 'a._b', '.abc', '_abc', 'Has Space', 'x'.repeat(25), 'bad!name']) {
            await assert.rejects(register({ username: bad }), /Username must be/, `username "${bad}" should be refused`);
        }
    });

    test('rejects reserved usernames', async () => {
        for (const reserved of ['admin', 'root', 'api', 'support', 'login', 'settings']) {
            await assert.rejects(register({ username: reserved }), /reserved/);
        }
    });

    test('rejects malformed phone numbers', async () => {
        for (const bad of ['0123456789', '+0123456789', '12345', '+49 170 123', '+1234567890123456']) {
            await assert.rejects(register({ phone: bad }), /international format/, `phone "${bad}"`);
        }
    });

    test('rejects bad names, bad emails, and missing credentials', async () => {
        await assert.rejects(register({ name: '   ' }), /Name must be/);
        await assert.rejects(register({ name: 'x'.repeat(81) }), /Name must be/);
        await assert.rejects(register({ email: 'not-an-email' }), /valid email/);
        await assert.rejects(register({ hash: '' }), /password hash is required/);
        await assert.rejects(register({ provider: 'google', hash: '', googleId: '' }), /Google id is required/);
        await assert.rejects(register({ provider: 'facebook' }), /authProvider/);
    });

    test('rejects a call with the wrong number of arguments', async () => {
        await assert.rejects(ledger.submit('registerUser', 'a@b.com', 'A'), /Expected:/);
    });
});

describe('lookups', () => {
    test('getUserByUsername resolves through the index, ignoring @ and casing', async () => {
        await register();
        const user = await ledger.evaluate('getUserByUsername', '@ANN.lee');
        assert.equal(user.email, 'ann@example.com');
        await assert.rejects(ledger.evaluate('getUserByUsername', 'nobody'), /does not exist/);
    });

    test('getUserByGoogleId resolves through the index', async () => {
        await register({ provider: 'google', hash: '', googleId: 'g-9' });
        assert.equal((await ledger.evaluate('getUserByGoogleId', 'g-9')).email, 'ann@example.com');
        await assert.rejects(ledger.evaluate('getUserByGoogleId', 'nope'), /No user is linked/);
    });

    test('old-style records (no username/phone/etc.) are still readable', async () => {
        ledger.world.set('user:old@example.com', Buffer.from(JSON.stringify({
            docType: 'user', email: 'old@example.com', name: 'Old Timer',
            passwordHash: '$2a$10$legacy', googleId: '', authProviders: ['email']
        })));
        const user = await ledger.evaluate('getUser', 'old@example.com');
        assert.equal(user.username, '');
        assert.deepEqual(user.projectIds, []);
        assert.equal(user.emailVerifiedAt, '');
    });
});

describe('password, Google link/unlink, email confirmation', () => {
    test('updatePasswordHash replaces the hash', async () => {
        await register();
        const updated = await ledger.submit('updatePasswordHash', 'ann@example.com', 'scrypt$new');
        assert.equal(updated.passwordHash, 'scrypt$new');
        await assert.rejects(ledger.submit('updatePasswordHash', 'nobody@example.com', 'x'), /does not exist/);
        await assert.rejects(ledger.submit('updatePasswordHash', 'ann@example.com', ''), /password hash is required/);
    });

    test('linkGoogle refuses a Google account owned by another user', async () => {
        await register();
        await register({ email: 'bob@example.com', username: 'bob.b' });
        await ledger.submit('linkGoogle', 'ann@example.com', 'g-1', 'http://pic');
        await assert.rejects(ledger.submit('linkGoogle', 'bob@example.com', 'g-1', ''), /already linked to another user/);
    });

    test('linkGoogle is idempotent for the same user but refuses a second, different Google account', async () => {
        await register();
        await ledger.submit('linkGoogle', 'ann@example.com', 'g-1', '');
        await ledger.submit('linkGoogle', 'ann@example.com', 'g-1', '');
        await assert.rejects(ledger.submit('linkGoogle', 'ann@example.com', 'g-2', ''), /Disconnect it first/);
    });

    test('unlinkGoogle needs a password so the person cannot lock themselves out', async () => {
        await register({ provider: 'google', hash: '', googleId: 'g-1' });
        await assert.rejects(ledger.submit('unlinkGoogle', 'ann@example.com'), /Set a password first/);
        await ledger.submit('updatePasswordHash', 'ann@example.com', 'scrypt$pw');
        const user = await ledger.submit('unlinkGoogle', 'ann@example.com');
        assert.equal(user.googleId, '');
        assert.ok(!user.authProviders.includes('google'));
        assert.equal(ledger.peek('idx:google:g-1'), null, 'the index key is released');
    });

    test('after unlinking, the Google account can be linked by someone else', async () => {
        await register();
        await register({ email: 'bob@example.com', username: 'bob.b' });
        await ledger.submit('linkGoogle', 'ann@example.com', 'g-1', '');
        await ledger.submit('unlinkGoogle', 'ann@example.com');
        const bob = await ledger.submit('linkGoogle', 'bob@example.com', 'g-1', '');
        assert.equal(bob.googleId, 'g-1');
    });

    test('unlinkGoogle fails when nothing is linked', async () => {
        await register();
        await assert.rejects(ledger.submit('unlinkGoogle', 'ann@example.com'), /No Google account/);
    });

    test('markEmailVerified stamps the time once and never moves it', async () => {
        await register();
        const first = await ledger.submit('markEmailVerified', 'ann@example.com');
        assert.ok(first.emailVerifiedAt);
        clock.s += 3600;
        const second = await ledger.submit('markEmailVerified', 'ann@example.com');
        assert.equal(second.emailVerifiedAt, first.emailVerifiedAt);
    });
});

describe('directory and audit trail', () => {
    test('getAllUsers returns only email, name and username — never secrets — and no index keys', async () => {
        await register({ phone: '+491701234567', provider: 'email' });
        await register({ email: 'bob@example.com', username: 'bob.b', name: 'Bob B' });
        const users = await ledger.evaluate('getAllUsers');
        assert.equal(users.length, 2, 'index keys must not show up as users');
        for (const u of users) assert.deepEqual(Object.keys(u).sort(), ['email', 'name', 'username']);
        assert.ok(!JSON.stringify(users).includes('scrypt'));
        assert.ok(!JSON.stringify(users).includes('+49'));
    });

    test('getUserHistory lists every account change in order and strips secrets', async () => {
        await register();
        clock.s += 60;
        await ledger.submit('updatePasswordHash', 'ann@example.com', 'scrypt$pw2');
        clock.s += 60;
        await ledger.submit('linkGoogle', 'ann@example.com', 'g-secret-id', 'http://pic');
        clock.s += 60;
        await ledger.submit('markEmailVerified', 'ann@example.com');

        const events = await ledger.evaluate('getUserHistory', 'ann@example.com');
        assert.equal(events.length, 4);
        assert.deepEqual(events.map(e => e.value.googleLinked), [false, false, true, true]);
        assert.deepEqual(events.map(e => e.value.emailVerified), [false, false, false, true]);
        assert.deepEqual(events.map(e => e.value.passwordChanges), [0, 1, 1, 1]);
        assert.ok(events.every(e => e.value.hasPassword));
        const times = events.map(e => e.timestamp);
        assert.deepEqual(times, [...times].sort(), 'oldest first');
        const text = JSON.stringify(events);
        assert.ok(!text.includes('scrypt'));
        assert.ok(!text.includes('g-secret-id'));
        assert.ok(!text.includes('passwordHash'));
    });

    test('creating a project and adding a member updates each account\'s "my projects" index', async () => {
        await register();
        await register({ email: 'bob@example.com', username: 'bob.b' });
        await ledger.submit('createProject', 'p1', 'Thesis', 'desc', 'ann@example.com');
        await ledger.submit('addProjectMember', 'p1', 'bob@example.com', 'contributor');
        assert.deepEqual((await ledger.evaluate('getMyProjects', 'ann@example.com')).map(p => p.projectId), ['p1']);
        assert.deepEqual((await ledger.evaluate('getMyProjects', 'bob@example.com')).map(p => p.projectId), ['p1']);
    });
});
