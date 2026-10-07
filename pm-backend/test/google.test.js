'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, STRONG } = require('./helpers/harness');

const profiles = {
    'tok-new': { email: 'newbie@gmail.com', emailVerified: true, name: 'New Bie', googleId: 'g-new', picture: 'http://pic/new' },
    'tok-unverified': { email: 'unverified@gmail.com', emailVerified: false, name: 'Un Verified', googleId: 'g-unv' },
    'tok-alex1': { email: 'alex.smith@gmail.com', emailVerified: true, name: 'Alex Smith', googleId: 'g-a1' },
    'tok-alex2': { email: 'alex.smith@outlook.com', emailVerified: true, name: 'Alex Smith', googleId: 'g-a2' },
    'tok-takeover': { email: 'owner@example.com', emailVerified: true, name: 'Owner', googleId: 'g-owner' },
    'tok-link': { email: 'someone.else@gmail.com', emailVerified: true, name: 'Linker', googleId: 'g-link', picture: 'http://pic/link' },
    'tok-link-unverified': { email: 'meh@gmail.com', emailVerified: false, name: 'Meh', googleId: 'g-meh' },
    'tok-solo': { email: 'solo@gmail.com', emailVerified: true, name: 'Solo Gmail', googleId: 'g-solo' },
    'tok-unlink': { email: 'unlink.me@gmail.com', emailVerified: true, name: 'Unlink Me', googleId: 'g-unlink' },
    'tok-audit': { email: 'audit.me@gmail.com', emailVerified: true, name: 'Audit Me', googleId: 'g-audit' }
};

let t;
before(async () => { t = await startTestApp({ googleProfiles: profiles }); });
after(async () => { await t.close(); });

const google = (idToken, cookie) => t.request('POST', '/api/auth/google', { json: { idToken }, cookie });

describe('configuration', () => {
    test('/auth/config exposes the client id when configured, and null when not', async () => {
        const on = await t.request('GET', '/api/auth/config');
        assert.equal(on.body.googleClientId, 'test-client-id.apps.googleusercontent.com');

        const off = await startTestApp();
        try {
            assert.deepEqual((await off.request('GET', '/api/auth/config')).body, { googleClientId: null });
            const r = await off.request('POST', '/api/auth/google', { json: { idToken: 'anything' } });
            assert.equal(r.status, 503);
            assert.match(r.body.error, /not configured/i);
        } finally { await off.close(); }
    });
});

describe('sign-in and sign-up with Google', () => {
    test('invalid, empty and missing tokens are refused', async () => {
        assert.equal((await google('tok-does-not-exist')).status, 401);
        assert.equal((await google('')).status, 400);
        assert.equal((await t.request('POST', '/api/auth/google', { json: {} })).status, 400);
        assert.equal((await t.request('POST', '/api/auth/google', { json: { idToken: 12345 } })).status, 400);
    });

    test('a first sign-in creates a verified account, a second one signs into the same account', async () => {
        const first = await google('tok-new');
        assert.equal(first.status, 201);
        assert.equal(first.body.user.email, 'newbie@gmail.com');
        assert.equal(first.body.user.email_verified, true, 'Google already verified the address');
        assert.equal(first.body.user.google_linked, true);
        assert.equal(first.body.user.has_password, false);
        assert.equal(first.body.user.avatar_url, 'http://pic/new');
        assert.ok(first.body.user.username);
        assert.ok(first.sid);
        assert.equal((await t.request('GET', '/api/auth/me', { cookie: first.sid })).status, 200);

        const second = await google('tok-new');
        assert.equal(second.status, 200);
        assert.equal(second.body.user.email, 'newbie@gmail.com');
        assert.equal(second.body.user.username, first.body.user.username);
    });

    test('an unverified Google email is refused and no account is created', async () => {
        const r = await google('tok-unverified');
        assert.equal(r.status, 401);
        assert.match(r.body.error, /not verified/i);
        assert.equal(t.ledger.peek('user:unverified@gmail.com'), null);
    });

    test('never takes over an existing password account', async () => {
        const { cookie } = await t.signUp({ email: 'owner@example.com', username: 'the.owner' });
        const r = await google('tok-takeover');
        assert.equal(r.status, 409);
        assert.equal(r.body.error, 'An account with this email already exists. Sign in with your password, then connect Google from Settings.');
        assert.equal(r.sid, null, 'no session was issued');

        const me = await t.request('GET', '/api/auth/me', { cookie });
        assert.equal(me.body.user.google_linked, false, 'the account was left untouched');
        const login = await t.request('POST', '/api/auth/login', { json: { identifier: 'owner@example.com', password: STRONG } });
        assert.equal(login.status, 200, 'the password still works');
    });

    test('accounts created from similar emails get distinct usernames', async () => {
        const a = await google('tok-alex1');
        const b = await google('tok-alex2');
        assert.equal(a.status, 201);
        assert.equal(b.status, 201);
        assert.notEqual(a.body.user.username, b.body.user.username);
        assert.match(a.body.user.username, /^[a-z0-9][a-z0-9._]{2,23}$/);
        assert.match(b.body.user.username, /^[a-z0-9][a-z0-9._]{2,23}$/);
    });

    test('a Google-only account can set a password without a current password', async () => {
        const g = await google('tok-solo');
        const r = await t.request('POST', '/api/auth/password', { cookie: g.sid, json: { newPassword: 'Fresh!Garden#2026z' } });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.has_password, true);
        const login = await t.request('POST', '/api/auth/login', { json: { identifier: 'solo@gmail.com', password: 'Fresh!Garden#2026z' } });
        assert.equal(login.status, 200);
    });
});

describe('connecting and disconnecting Google', () => {
    test('linking needs a session', async () => {
        const r = await t.request('POST', '/api/auth/google/link', { json: { idToken: 'tok-link' } });
        assert.equal(r.status, 401);
    });

    test('a signed-in person can connect Google, then sign in with it', async () => {
        const { cookie } = await t.signUp({ email: 'linker@example.com', username: 'the.linker' });
        const linked = await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'tok-link' } });
        assert.equal(linked.status, 200);
        assert.equal(linked.body.user.google_linked, true);
        assert.equal(linked.body.user.email, 'linker@example.com', 'still the same account');

        const viaGoogle = await google('tok-link');
        assert.equal(viaGoogle.status, 200);
        assert.equal(viaGoogle.body.user.email, 'linker@example.com');
    });

    test('a Google account that belongs to someone else cannot be linked (409)', async () => {
        const { cookie } = await t.signUp({ email: 'thief@example.com', username: 'the.thief' });
        const r = await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'tok-link' } });
        assert.equal(r.status, 409);
        assert.match(r.body.error, /already linked to another user/);
    });

    test('invalid or unverified tokens cannot be linked', async () => {
        const { cookie } = await t.signUp({ email: 'linker2@example.com', username: 'the.linker2' });
        assert.equal((await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'nope' } })).status, 401);
        assert.equal((await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'tok-link-unverified' } })).status, 400);
    });

    test('disconnecting works for accounts with a password, and releases the Google account', async () => {
        const { cookie } = await t.signUp({ email: 'unlinker@example.com', username: 'the.unlinker' });
        assert.equal((await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'tok-unlink' } })).status, 200);
        assert.equal(t.ledger.peek('idx:google:g-unlink'), 'unlinker@example.com');

        const out = await t.request('DELETE', '/api/auth/google', { cookie });
        assert.equal(out.status, 200);
        assert.equal(out.body.user.google_linked, false);
        assert.equal(out.body.user.has_password, true);
        assert.equal(t.ledger.peek('idx:google:g-unlink'), null, 'the Google account is free again');
    });

    test('disconnecting when nothing is connected is a clear 400', async () => {
        const { cookie } = await t.signUp({ email: 'nolink@example.com', username: 'no.link' });
        const none = await t.request('DELETE', '/api/auth/google', { cookie });
        assert.equal(none.status, 400);
        assert.match(none.body.error, /No Google account/);
    });

    test('a Google-only account cannot disconnect until it has a password', async () => {
        const g = await google('tok-new'); // newbie@gmail.com, created earlier, Google-only
        const blocked = await t.request('DELETE', '/api/auth/google', { cookie: g.sid });
        assert.equal(blocked.status, 400);
        assert.equal(blocked.body.error, 'Set a password first, otherwise you could not sign in again.');

        const set = await t.request('POST', '/api/auth/password', { cookie: g.sid, json: { newPassword: 'Fresh!Garden#2026q' } });
        assert.equal(set.status, 200);
        const ok = await t.request('DELETE', '/api/auth/google', { cookie: g.sid });
        assert.equal(ok.status, 200);
        assert.equal(ok.body.user.google_linked, false);
        assert.equal(ok.body.user.has_password, true);
    });

    test('link and unlink are recorded in the security activity on the ledger', async () => {
        const { cookie } = await t.signUp({ email: 'audited@example.com', username: 'audited.one' });
        const linked = await t.request('POST', '/api/auth/google/link', { cookie, json: { idToken: 'tok-audit' } });
        assert.equal(linked.status, 200);
        await t.request('DELETE', '/api/auth/google', { cookie });
        const log = await t.request('GET', '/api/auth/security-log', { cookie });
        const flags = log.body.events.map(e => e.value.googleLinked);
        assert.deepEqual(flags.slice(-3), [false, true, false], 'sign-up, link, unlink');
    });
});
