'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    hashPassword, verifyPassword, verifyAgainstDummy, checkPassword,
    PASSWORD_RULES, COMMON_PASSWORDS
} = require('../lib/passwords');

describe('scrypt hashing', () => {
    test('stores "scrypt$N$r$p$salt$key" with the documented cost', async () => {
        const stored = await hashPassword('Zebra!Coffee#2025x');
        const parts = stored.split('$');
        assert.equal(parts.length, 6);
        assert.deepEqual(parts.slice(0, 4), ['scrypt', String(2 ** 15), '8', '1']);
        assert.equal(Buffer.from(parts[4], 'base64').length, 16, '16-byte salt');
        assert.equal(Buffer.from(parts[5], 'base64').length, 64, '64-byte key');
        assert.ok(!stored.includes('Zebra'), 'the plain password is never part of the hash');
    });

    test('the same password hashes differently every time (random salt)', async () => {
        const a = await hashPassword('Zebra!Coffee#2025x');
        const b = await hashPassword('Zebra!Coffee#2025x');
        assert.notEqual(a, b);
    });

    test('verifies the right password and rejects the wrong one (case-sensitive)', async () => {
        const stored = await hashPassword('Zebra!Coffee#2025x');
        assert.equal(await verifyPassword('Zebra!Coffee#2025x', stored), true);
        assert.equal(await verifyPassword('zebra!coffee#2025x', stored), false);
        assert.equal(await verifyPassword('', stored), false);
    });

    test('old hashes keep verifying with the parameters stored inside them', async () => {
        const crypto = require('node:crypto');
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync('Old!Password1', salt, 64, { N: 1024, r: 8, p: 1 });
        const legacy = `scrypt$1024$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
        assert.equal(await verifyPassword('Old!Password1', legacy), true);
        assert.equal(await verifyPassword('Old!Password2', legacy), false);
    });

    test('malformed or foreign stored values never verify (and never throw)', async () => {
        for (const bad of ['', null, undefined, 'plaintext', '$2a$10$bcrypt', 'scrypt$x$y$z$a$b', 'scrypt$1$1$1$$', 'a$b$c$d$e$f']) {
            assert.equal(await verifyPassword('anything', bad), false);
        }
    });

    test('input is capped at 1000 characters before hashing', async () => {
        const base = 'Aa1!'.repeat(250); // exactly 1000
        const stored = await hashPassword(base + 'tail-one');
        assert.equal(await verifyPassword(base + 'tail-two', stored), true, 'only the first 1000 chars matter');
    });

    test('the dummy verification used for unknown users always answers false', async () => {
        assert.equal(await verifyAgainstDummy('whatever'), false);
    });
});

describe('password rules', () => {
    const ctx = { email: 'alexandra.rossi@example.com', username: 'alex_r', name: 'Alexandra Rossi' };

    test('a strong password has no problems', () => {
        assert.deepEqual(checkPassword('Zebra!Coffee#2025x', ctx), []);
    });

    test('reports each missing requirement in plain English', () => {
        assert.deepEqual(checkPassword('short', {}), [
            'Use at least 10 characters.',
            'Add an uppercase letter.',
            'Add a number.',
            'Add a special character (for example ! ? # $ %).'
        ]);
        assert.deepEqual(checkPassword('ALLUPPERCASE123!', {}), ['Add a lowercase letter.']);
        assert.deepEqual(checkPassword('nouppercase123!', {}), ['Add an uppercase letter.']);
        assert.deepEqual(checkPassword('NoNumbersHere!!', {}), ['Add a number.']);
        assert.deepEqual(checkPassword('NoSpecials12345', {}), ['Add a special character (for example ! ? # $ %).']);
    });

    test('enforces the 128 character maximum', () => {
        const long = 'Aa1!' + 'x'.repeat(125);
        assert.deepEqual(checkPassword(long, {}), ['Use at most 128 characters.']);
        assert.deepEqual(checkPassword('Aa1!' + 'x'.repeat(124), {}), []);
    });

    test('refuses common passwords, including decorated ones', () => {
        const message = 'That password is too common. Choose something less guessable.';
        assert.ok(checkPassword('Password123!', {}).includes(message));
        assert.ok(checkPassword('Qwerty123!', {}).includes(message));
        assert.ok(checkPassword('Welcome1!!', {}).includes(message));
        assert.ok(!checkPassword('Zebra!Coffee#2025x', {}).includes(message));
    });

    test('refuses passwords containing personal information (4+ characters only)', () => {
        assert.ok(checkPassword('xx-Alexandra.Rossi-99!', ctx).includes('Do not include your email name in the password.'));
        assert.ok(checkPassword('Zebra!ALEX_R#2025', ctx).includes('Do not include your username in the password.'));
        assert.ok(checkPassword('Zebra!alexandra#2025', ctx).includes('Do not include your first name in the password.'));
        // a 3-character name or username is too short to count as personal info
        assert.deepEqual(checkPassword('Zebra!Amy#2025x', { name: 'Amy Lee', username: 'amy', email: 'amy@x.com' }), []);
    });

    test('accepts spaces and unicode characters', () => {
        assert.deepEqual(checkPassword('Correct Horse 9 Battery', {}), []);
        assert.deepEqual(checkPassword('Ünïcödé-Pässwört-7', {}), []);
        assert.deepEqual(checkPassword('Zebra Coffee 2025 x', {}), [], 'a space counts as a special character');
    });

    test('every rule has an id, a label and a problem message', () => {
        for (const rule of PASSWORD_RULES) {
            assert.ok(rule.id && rule.label && rule.problem && typeof rule.ok === 'function');
        }
    });
});

describe('client/server parity', () => {
    // The browser has its own copy of the rules (so the checklist is live as
    // you type). The server is the authority; this proves the two agree.
    test('both copies give identical answers', async () => {
        const clientPath = path.join(__dirname, '..', '..', 'pm-frontend', 'src', 'lib', 'passwordRules.js');
        const client = await import(pathToFileURL(clientPath).href);

        assert.deepEqual(client.COMMON_PASSWORDS, COMMON_PASSWORDS, 'same common-password list');
        assert.deepEqual(
            client.PASSWORD_RULES.map(r => [r.id, r.label, r.problem]),
            PASSWORD_RULES.map(r => [r.id, r.label, r.problem]),
            'same rules, labels and messages'
        );

        const ctx = { email: 'alexandra.rossi@example.com', username: 'alex_r', name: 'Alexandra Rossi' };
        const samples = [
            '', 'a', 'short', 'ALLUPPERCASE123!', 'nouppercase123!', 'NoNumbersHere!!', 'NoSpecials12345',
            'Zebra!Coffee#2025x', 'Password123!', 'Qwerty123!', 'Welcome1!!', 'Correct Horse 9 Battery',
            'Ünïcödé-Pässwört-7', 'xx-Alexandra.Rossi-99!', 'Zebra!ALEX_R#2025', 'Zebra!alexandra#2025',
            'Aa1!' + 'x'.repeat(125), 'Aa1!' + 'x'.repeat(124), '     ', '1234567890', 'Zebra Coffee 2025 x',
            'ÀÉÎÕÜ-12345-àéîõü', '密码Password1!密码'
        ];
        for (const sample of samples) {
            for (const c of [ctx, {}]) {
                assert.deepEqual(
                    client.checkPassword(sample, c),
                    checkPassword(sample, c),
                    `client and server disagree for ${JSON.stringify(sample)}`
                );
            }
        }
    });
});
