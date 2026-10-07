'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startTestApp } = require('./helpers/harness');
const { sha256, DAY } = require('../lib/store');

let t;
before(async () => { t = await startTestApp(); });
after(async () => { await t.close(); });

const send = (cookie) => t.request('POST', '/api/auth/email/send-verification', { cookie, json: {} });
const tokenOf = (link) => new URL(link).searchParams.get('token');
const verify = (token, cookie) => t.request('POST', '/api/auth/email/verify', { cookie, json: { token } });

describe('sending the confirmation email', () => {
    test('preview mode writes the message to disk and returns the link for development', async () => {
        const { cookie } = await t.signUp({ email: 'mail1@example.com', username: 'mail.one' });
        const r = await send(cookie);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
        assert.match(r.body.dev_link, /^http:\/\/localhost:5173\/verify-email\?token=[A-Za-z0-9_-]{40,}$/);

        const files = fs.readdirSync(t.previewDir).filter(f => f.includes('mail1-example-com'));
        assert.ok(files.some(f => f.endsWith('.html')));
        const txt = files.find(f => f.endsWith('.txt'));
        assert.ok(fs.readFileSync(`${t.previewDir}/${txt}`, 'utf8').includes(r.body.dev_link));
    });

    test('only a hash of the token is stored, and the send is logged', async () => {
        const { cookie } = await t.signUp({ email: 'mail2@example.com', username: 'mail.two' });
        const token = tokenOf((await send(cookie)).body.dev_link);
        assert.ok(t.store.emailTokens.has(sha256(token)));
        assert.ok(!t.store.emailTokens.has(token));
        const logged = t.store.emailLog.filter(e => e.to === 'mail2@example.com');
        assert.equal(logged.length, 1);
        assert.equal(logged[0].purpose, 'verify');
    });

    test('needs a session', async () => {
        assert.equal((await send(undefined)).status, 401);
    });

    test('an already-confirmed address is not emailed again', async () => {
        const { cookie } = await t.signUp({ email: 'mail3@example.com', username: 'mail.three' });
        await verify(tokenOf((await send(cookie)).body.dev_link));
        const again = await send(cookie);
        assert.equal(again.status, 200);
        assert.equal(again.body.alreadyVerified, true);
        assert.equal(again.body.dev_link, undefined);
    });

    test('is limited to 6 emails per hour per user', async () => {
        const { cookie } = await t.signUp({ email: 'mail4@example.com', username: 'mail.four' });
        const statuses = [];
        for (let i = 0; i < 7; i++) statuses.push((await send(cookie)).status);
        assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
    });
});

describe('confirming the address', () => {
    test('marks the email as confirmed on the ledger', async () => {
        const { cookie } = await t.signUp({ email: 'ok1@example.com', username: 'ok.one' });
        const token = tokenOf((await send(cookie)).body.dev_link);
        assert.equal((await t.request('GET', '/api/auth/me', { cookie })).body.user.email_verified, false);

        const r = await verify(token); // no session needed: the emailed token proves mailbox control
        assert.equal(r.status, 200);
        assert.equal(r.body.user.email_verified, true);
        assert.ok(JSON.parse(t.ledger.peek('user:ok1@example.com')).emailVerifiedAt);
        assert.equal((await t.request('GET', '/api/auth/me', { cookie })).body.user.email_verified, true);
    });

    test('a token works exactly once', async () => {
        const { cookie } = await t.signUp({ email: 'ok2@example.com', username: 'ok.two' });
        const token = tokenOf((await send(cookie)).body.dev_link);
        assert.equal((await verify(token)).status, 200);
        const second = await verify(token);
        assert.equal(second.status, 400);
        assert.match(second.body.error, /invalid or has expired/);
    });

    test('junk, empty and missing tokens are refused', async () => {
        for (const token of ['junk', '', 'x'.repeat(60), undefined, null, 42, {}]) {
            const r = await t.request('POST', '/api/auth/email/verify', { json: { token } });
            assert.equal(r.status, 400, JSON.stringify(token));
        }
    });

    test('tokens expire after 24 hours', async () => {
        const { cookie } = await t.signUp({ email: 'ok3@example.com', username: 'ok.three' });
        const token = tokenOf((await send(cookie)).body.dev_link);
        t.clock.ms += DAY + 1000;
        assert.equal((await verify(token)).status, 400);
    });

    test('asking for a new email invalidates the previous link', async () => {
        const { cookie } = await t.signUp({ email: 'ok4@example.com', username: 'ok.four' });
        const first = tokenOf((await send(cookie)).body.dev_link);
        const second = tokenOf((await send(cookie)).body.dev_link);
        assert.notEqual(first, second);
        assert.equal((await verify(first)).status, 400);
        assert.equal((await verify(second)).status, 200);
    });

    test('the email address is recorded in the account\'s security activity', async () => {
        const { cookie } = await t.signUp({ email: 'ok5@example.com', username: 'ok.five' });
        await verify(tokenOf((await send(cookie)).body.dev_link));
        const log = await t.request('GET', '/api/auth/security-log', { cookie });
        const flags = log.body.events.map(e => e.value.emailVerified);
        assert.deepEqual(flags, [false, true]);
    });
});

describe('verification is optional', () => {
    test('an unconfirmed account can use the whole app', async () => {
        const { cookie } = await t.signUp({ email: 'free@example.com', username: 'free.user' });
        const project = await t.request('POST', '/api/projects', {
            cookie, json: { projectId: 'unverified-p', name: 'Works', description: 'No confirmation needed' }
        });
        assert.equal(project.status, 201);
        const login = await t.request('POST', '/api/auth/login', { json: { identifier: 'free@example.com', password: 'Zebra!Coffee#2025x' } });
        assert.equal(login.status, 200);
    });
});
