'use strict';

// Sign-up, sign-in, sessions and password change against a real server.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, STRONG } = require('./helpers/harness');
const { sha256, DAY } = require('../lib/store');

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

const userRecord = (email) => JSON.parse(t.ledger.peek(`user:${email}`));

describe('sign-up', () => {
    test('creates the account on the ledger and signs the person in immediately', async () => {
        const { res, cookie } = await t.signUp({ email: 'first@example.com', username: 'first.one' });
        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, 'first@example.com');
        assert.equal(res.body.user.username, 'first.one');
        assert.ok(cookie, 'a session cookie was issued');
        const me = await t.request('GET', '/api/auth/me', { cookie });
        assert.equal(me.status, 200);
        assert.equal(me.body.user.email, 'first@example.com');
        assert.ok(userRecord('first@example.com').createdAt, 'the account exists on the ledger');
    });

    test('the password hash is scrypt, is stored on the ledger, and is never returned', async () => {
        const { res } = await t.signUp({ email: 'hash@example.com', username: 'hash.user' });
        assert.match(userRecord('hash@example.com').passwordHash, /^scrypt\$32768\$8\$1\$/);
        const text = JSON.stringify(res.body);
        assert.ok(!text.includes('scrypt'));
        assert.ok(!text.includes('passwordHash'));
        assert.equal(res.body.user.has_password, true);
        assert.ok(!text.includes(STRONG), 'the plain password is never echoed');
        assert.ok(!t.ledger.peek('user:hash@example.com').includes(STRONG), 'and never reaches the ledger');
    });

    test('the session token is stored only as a SHA-256 hash', async () => {
        const { cookie } = await t.signUp();
        assert.ok(cookie.length >= 40);
        assert.ok(t.store.sessions.has(sha256(cookie)));
        assert.ok(!t.store.sessions.has(cookie));
        assert.ok(!JSON.stringify([...t.store.sessions.keys()]).includes(cookie));
    });

    test('two accounts with the same password get different hashes', async () => {
        await t.signUp({ email: 'same1@example.com', username: 'same.one' });
        await t.signUp({ email: 'same2@example.com', username: 'same.two' });
        assert.notEqual(userRecord('same1@example.com').passwordHash, userRecord('same2@example.com').passwordHash);
    });

    test('cookie is HttpOnly, SameSite=Lax, Path=/, 30 days, and Secure only over HTTPS', async () => {
        const plain = await t.request('POST', '/api/auth/signup', {
            json: { name: 'Cookie One', email: 'cookie1@example.com', username: 'cookie.one', password: STRONG }
        });
        const c = plain.setCookie.find(x => x.startsWith('sid='));
        assert.match(c, /HttpOnly/);
        assert.match(c, /SameSite=Lax/);
        assert.match(c, /Path=\//);
        assert.match(c, /Max-Age=2592000/);
        assert.doesNotMatch(c, /Secure/);

        const proxied = await t.request('POST', '/api/auth/signup', {
            json: { name: 'Cookie Two', email: 'cookie2@example.com', username: 'cookie.two', password: STRONG },
            headers: { 'X-Forwarded-Proto': 'https' }
        });
        assert.match(proxied.setCookie.find(x => x.startsWith('sid=')), /; Secure/);
    });

    test('rejects duplicate email, username and phone in any casing', async () => {
        await t.signUp({ email: 'dupe@example.com', username: 'dupe.user', phone: '+49 170 1234567' });

        let r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'X', email: 'DUPE@Example.com', username: 'other.name', password: STRONG }
        });
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'An account with this email already exists. Try signing in.');

        r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'X', email: 'new1@example.com', username: '@DUPE.User', password: STRONG }
        });
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'That username is already taken.');

        r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'X', email: 'new2@example.com', username: 'new.two', phone: '0049 (170) 123-4567', password: STRONG }
        });
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'That phone number is already used by another account.');
        assert.equal(t.ledger.peek('user:new2@example.com'), null, 'a refused sign-up leaves nothing behind');
    });

    test('validates every field with a clear message', async () => {
        const base = { name: 'Valid Name', email: 'valid@example.com', username: 'valid.name', password: STRONG };
        const cases = [
            [{ name: '' }, /name/i],
            [{ name: 'x'.repeat(81) }, /80/],
            [{ email: 'not-an-email' }, /valid email/i],
            [{ email: 'a'.repeat(250) + '@example.com' }, /too long|valid email/i],
            [{ username: 'ab' }, /3-24/],
            [{ username: 'a..b' }, /next to each other/],
            [{ username: 'admin' }, /reserved/],
            [{ phone: '12345' }, /international format/],
            [{ password: '' }, /password/i]
        ];
        for (const [override, pattern] of cases) {
            const r = await t.request('POST', '/api/auth/signup', { json: { ...base, ...override } });
            assert.equal(r.status, 400, JSON.stringify(override));
            assert.match(r.body.error, pattern, JSON.stringify(override));
        }
    });

    test('normalises email (trim + lower-case), username (@ and case) and phone (+digits)', async () => {
        const r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'Norm Al', email: '  Norm.Al@Example.COM ', username: '@Norm.AL', phone: '0049 170 1234500', password: STRONG }
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.user.email, 'norm.al@example.com');
        assert.equal(r.body.user.username, 'norm.al');
        assert.equal(r.body.user.phone, '+491701234500');
    });

    test('weak passwords get a 400 with the list of problems', async () => {
        const r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'Weak One', email: 'weak@example.com', username: 'weak.one', password: 'short' }
        });
        assert.equal(r.status, 400);
        assert.ok(Array.isArray(r.body.problems));
        assert.ok(r.body.problems.includes('Use at least 10 characters.'));
        assert.equal(t.ledger.peek('user:weak@example.com'), null);
    });

    test('a password containing the username, email name or first name is refused', async () => {
        const r = await t.request('POST', '/api/auth/signup', {
            json: { name: 'Marta Bianchi', email: 'mb@example.com', username: 'marta_b', password: 'Zebra!marta#2025x' }
        });
        assert.equal(r.status, 400);
        assert.ok(r.body.problems.includes('Do not include your first name in the password.'));
    });

    test('username availability endpoint', async () => {
        await t.signUp({ email: 'avail@example.com', username: 'taken.name' });
        const get = (u) => t.request('GET', `/api/auth/username-available?u=${encodeURIComponent(u)}`);
        assert.deepEqual((await get('free.name')).body, { available: true, reason: null });
        assert.equal((await get('@free.name')).body.available, true);
        assert.equal((await get('Taken.Name')).body.available, false);
        assert.match((await get('taken.name')).body.reason, /already taken/);
        assert.equal((await get('admin')).body.available, false);
        assert.equal((await get('x')).body.available, false);
        assert.equal((await get('')).body.available, false);
    });

    test('every new account starts with its own empty set of projects', async () => {
        const { cookie } = await t.signUp();
        const mine = await t.request('GET', '/api/projects/mine', { cookie });
        assert.equal(mine.status, 200);
        assert.deepEqual(mine.body, []);
    });
});

describe('sign-in', () => {
    let account;
    before(async () => {
        account = await t.signUp({ name: 'Login Person', email: 'login@example.com', username: 'login.person' });
    });
    const login = (identifier, password = STRONG, extra = {}) =>
        t.request('POST', '/api/auth/login', { json: { identifier, password, ...extra } });

    test('works with the email in any casing', async () => {
        for (const id of ['login@example.com', 'LOGIN@Example.COM', '  login@example.com  ']) {
            const r = await login(id);
            assert.equal(r.status, 200, id);
            assert.equal(r.body.user.email, 'login@example.com');
            assert.ok(r.sid);
        }
    });

    test('works with the username, with or without a leading @', async () => {
        for (const id of ['login.person', '@login.person', 'LOGIN.Person', ' @Login.Person ']) {
            assert.equal((await login(id)).status, 200, id);
        }
    });

    test('still accepts the old "email" field name', async () => {
        const r = await t.request('POST', '/api/auth/login', { json: { email: 'login@example.com', password: STRONG } });
        assert.equal(r.status, 200);
    });

    test('every failure looks identical: wrong password, unknown email, unknown username, Google-only account', async () => {
        const gOnly = await startTestApp({ googleProfiles: { tok: { email: 'g@example.com', emailVerified: true, name: 'G Only', googleId: 'g1' } } });
        try {
            await gOnly.request('POST', '/api/auth/google', { json: { idToken: 'tok' } });
            const googleOnlyUsername = (await gOnly.request('POST', '/api/auth/google', { json: { idToken: 'tok' } })).body.user.username;

            const failures = [
                await login('login@example.com', 'Wrong!Password1'),
                await login('nobody@example.com'),
                await login('nobody.at.all'),
                await gOnly.request('POST', '/api/auth/login', { json: { identifier: 'g@example.com', password: STRONG } }),
                await gOnly.request('POST', '/api/auth/login', { json: { identifier: googleOnlyUsername, password: STRONG } })
            ];
            for (const f of failures) {
                assert.equal(f.status, 401);
                assert.deepEqual(f.body, { error: 'Invalid email, username or password.' });
                assert.equal(f.sid, null, 'no cookie on failure');
            }
        } finally { await gOnly.close(); }
    });

    test('the password is case-sensitive', async () => {
        assert.equal((await login('login@example.com', STRONG.toLowerCase())).status, 401);
        assert.equal((await login('login@example.com', STRONG.toUpperCase())).status, 401);
    });

    test('anything with an @ must be a valid email; missing fields are a 400', async () => {
        assert.equal((await login('a@b')).status, 400);
        assert.equal((await t.request('POST', '/api/auth/login', { json: { password: STRONG } })).status, 400);
        assert.equal((await t.request('POST', '/api/auth/login', { json: { identifier: 'login@example.com' } })).status, 400);
    });

    test('records the last sign-in time', async () => {
        t.clock.ms += 1000;
        await login('login@example.com');
        assert.equal(t.store.lastLogin.get('login@example.com'), t.clock.ms);
    });

    test('GET /api/auth/me returns the signed-in user, or 401', async () => {
        const ok = await t.request('GET', '/api/auth/me', { cookie: account.cookie });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.user.email, 'login@example.com');
        assert.ok(!JSON.stringify(ok.body).includes('scrypt'));
        assert.equal((await t.request('GET', '/api/auth/me')).status, 401);
    });
});

describe('sessions', () => {
    test('logout removes only that session and clears the cookie', async () => {
        const { cookie: c1 } = await t.signUp({ email: 'sess@example.com', username: 'sess.user' });
        const c2 = (await t.request('POST', '/api/auth/login', { json: { identifier: 'sess@example.com', password: STRONG } })).sid;
        assert.notEqual(c1, c2);

        const out = await t.request('POST', '/api/auth/logout', { cookie: c1 });
        assert.equal(out.status, 204);
        assert.equal(out.sid, '', 'cookie cleared');
        assert.match(out.setCookie.find(x => x.startsWith('sid=')), /Max-Age=0/);

        assert.equal((await t.request('GET', '/api/auth/me', { cookie: c1 })).status, 401);
        assert.equal((await t.request('GET', '/api/auth/me', { cookie: c2 })).status, 200, 'the other device stays signed in');
    });

    test('logout without a session is harmless', async () => {
        const r = await t.request('POST', '/api/auth/logout');
        assert.equal(r.status, 204);
    });

    test('expired sessions are refused and removed', async () => {
        const { cookie } = await t.signUp();
        t.clock.ms += 31 * DAY;
        assert.equal((await t.request('GET', '/api/auth/me', { cookie })).status, 401);
        assert.ok(!t.store.sessions.has(sha256(cookie)));
    });

    test('the purge timer logic removes expired sessions', async () => {
        const { cookie } = await t.signUp();
        t.clock.ms += 31 * DAY;
        assert.ok(t.store.purgeExpired() >= 1);
        assert.ok(!t.store.sessions.has(sha256(cookie)));
    });

    test('sliding expiry: renewed at most once a day', async () => {
        const { cookie } = await t.signUp();
        const sidCookies = (r) => r.setCookie.filter(x => x.startsWith('sid='));

        t.clock.ms += 2 * 60 * 60 * 1000; // 2 hours later
        assert.equal(sidCookies(await t.request('GET', '/api/auth/me', { cookie })).length, 0, 'too soon to renew');

        t.clock.ms += 25 * 60 * 60 * 1000; // more than a day since sign-in
        const renewed = await t.request('GET', '/api/auth/me', { cookie });
        assert.equal(renewed.status, 200);
        assert.equal(sidCookies(renewed).length, 1, 'cookie re-issued');
        assert.equal(renewed.sid, cookie, 'same token, fresh Max-Age');
        assert.equal(t.store.sessions.get(sha256(cookie)).expiresAt, t.clock.ms + 30 * DAY);

        assert.equal(sidCookies(await t.request('GET', '/api/auth/me', { cookie })).length, 0, 'not again on the same day');
    });

    test('last_seen is updated at most once a minute', () => {
        assert.equal(t.store.touchLastSeen('seen@example.com'), true);
        assert.equal(t.store.touchLastSeen('seen@example.com'), false);
        t.clock.ms += 61 * 1000;
        assert.equal(t.store.touchLastSeen('seen@example.com'), true);
    });

    test('forged, empty and malformed cookies are silently ignored', async () => {
        for (const cookie of ['forged', 'x'.repeat(43), '', '%E0%A4%A', 'a'.repeat(500)]) {
            const me = await t.request('GET', '/api/auth/me', { headers: { Cookie: `sid=${cookie}` } });
            assert.equal(me.status, 401, `cookie "${cookie.slice(0, 12)}"`);
            const pub = await t.request('GET', '/api/auth/config', { headers: { Cookie: `sid=${cookie}` } });
            assert.equal(pub.status, 200, 'public endpoints are unaffected');
        }
        const garbage = await t.request('GET', '/api/auth/me', { headers: { Cookie: ';;; = ; sid ; ===' } });
        assert.equal(garbage.status, 401);
    });
});

describe('route protection', () => {
    test('every protected endpoint answers 401 without a session', async () => {
        const protectedCalls = [
            ['GET', '/api/users'], ['GET', '/api/projects/mine'], ['GET', '/api/projects/p1'],
            ['POST', '/api/projects'], ['POST', '/api/projects/p1/members'], ['DELETE', '/api/projects/p1'],
            ['GET', '/api/projects/p1/history'], ['POST', '/api/tasks'], ['GET', '/api/tasks/t1'],
            ['PUT', '/api/tasks/t1/assign'], ['PUT', '/api/tasks/t1/status'], ['PUT', '/api/tasks/t1/meta'],
            ['DELETE', '/api/tasks/t1'], ['POST', '/api/tasks/t1/comments'], ['GET', '/api/tasks/t1/history'],
            ['POST', '/api/tasks/t1/files'], ['POST', '/api/auth/password'], ['POST', '/api/auth/google/link'],
            ['DELETE', '/api/auth/google'], ['POST', '/api/auth/email/send-verification'], ['GET', '/api/auth/security-log']
        ];
        for (const [method, url] of protectedCalls) {
            const r = await t.request(method, url, { json: method === 'GET' || method === 'DELETE' ? undefined : {} });
            assert.equal(r.status, 401, `${method} ${url}`);
            assert.deepEqual(r.body, { error: 'Please sign in.' });
        }
    });

    test('public endpoints stay public', async () => {
        assert.equal((await t.request('GET', '/api/auth/config')).status, 200);
        assert.equal((await t.request('GET', '/api/auth/username-available?u=abc')).status, 200);
        assert.equal((await t.request('POST', '/api/auth/logout')).status, 204);
        assert.equal((await t.request('POST', '/api/auth/login', { json: { identifier: 'nobody@example.com', password: 'x' } })).status, 401);
        const verify = await t.request('POST', '/api/auth/email/verify', { json: { token: 'junk' } });
        assert.equal(verify.status, 400, 'a bad token is a 400, not a 401');
    });

    test('unknown API routes are a JSON 404', async () => {
        const { cookie } = await t.signUp();
        const r = await t.request('GET', '/api/nope', { cookie });
        assert.equal(r.status, 404);
        assert.ok(r.body.error);
    });
});

describe('password change', () => {
    test('needs the current password', async () => {
        const { cookie } = await t.signUp({ email: 'pw1@example.com', username: 'pw.one' });
        const before = userRecord('pw1@example.com').passwordHash;
        for (const body of [{ newPassword: 'New!Password#2026y' }, { currentPassword: 'Wrong!Password1', newPassword: 'New!Password#2026y' }]) {
            const r = await t.request('POST', '/api/auth/password', { cookie, json: body });
            assert.equal(r.status, 400);
            assert.match(r.body.error, /current password/i);
        }
        assert.equal(userRecord('pw1@example.com').passwordHash, before, 'nothing changed');
    });

    test('enforces the same rules as sign-up', async () => {
        const { cookie } = await t.signUp({ email: 'pw2@example.com', username: 'pw.two' });
        const weak = await t.request('POST', '/api/auth/password', { cookie, json: { currentPassword: STRONG, newPassword: 'weak' } });
        assert.equal(weak.status, 400);
        assert.ok(weak.body.problems.includes('Use at least 10 characters.'));
        const personal = await t.request('POST', '/api/auth/password', { cookie, json: { currentPassword: STRONG, newPassword: 'Zebra!pw.two#2026' } });
        assert.equal(personal.status, 400);
        assert.ok(personal.body.problems.includes('Do not include your username in the password.'));
    });

    test('signs out every OTHER device but keeps the current one, and the old password stops working', async () => {
        const { cookie: here } = await t.signUp({ email: 'pw3@example.com', username: 'pw.three' });
        const other = (await t.request('POST', '/api/auth/login', { json: { identifier: 'pw3@example.com', password: STRONG } })).sid;

        const r = await t.request('POST', '/api/auth/password', {
            cookie: here, json: { currentPassword: STRONG, newPassword: 'New!Password#2026y' }
        });
        assert.equal(r.status, 200);
        assert.equal(r.body.otherSessionsSignedOut, 1);

        assert.equal((await t.request('GET', '/api/auth/me', { cookie: here })).status, 200);
        assert.equal((await t.request('GET', '/api/auth/me', { cookie: other })).status, 401);
        assert.equal((await t.request('POST', '/api/auth/login', { json: { identifier: 'pw3@example.com', password: STRONG } })).status, 401);
        assert.equal((await t.request('POST', '/api/auth/login', { json: { identifier: 'pw3@example.com', password: 'New!Password#2026y' } })).status, 200);
    });

    test('the change is recorded in the account\'s security activity on the ledger', async () => {
        const { cookie } = await t.signUp({ email: 'pw4@example.com', username: 'pw.four' });
        await t.request('POST', '/api/auth/password', { cookie, json: { currentPassword: STRONG, newPassword: 'New!Password#2026y' } });
        const log = await t.request('GET', '/api/auth/security-log', { cookie });
        assert.equal(log.status, 200);
        assert.ok(log.body.events.length >= 2, 'sign-up and password change are both on the ledger');
        assert.ok(!JSON.stringify(log.body).includes('scrypt'), 'no secrets in the activity feed');
        assert.ok(log.body.events.every(e => e.txId && e.timestamp));
    });
});
