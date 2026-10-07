'use strict';

// Cross-site protection, response headers, rate limiting and request hygiene.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, STRONG } = require('./helpers/harness');
const { createLimiter } = require('../lib/rateLimit');

let t;
// googleProfiles: {} switches Google sign-in "on" (with no valid tokens) so the
// Google endpoints can be exercised by the hygiene tests too.
before(async () => { t = await startTestApp({ googleProfiles: {} }); });
after(async () => { await t.close(); });

describe('cross-site request protection (CSRF)', () => {
    const newProject = (id) => ({ projectId: id, name: 'Name', description: 'Desc' });

    test('a cross-site POST is blocked even with a valid session', async () => {
        const { cookie } = await t.signUp();
        const r = await t.request('POST', '/api/projects', {
            cookie, json: newProject('csrf-1'), headers: { Origin: 'http://evil.example' }
        });
        assert.equal(r.status, 403);
        assert.equal(t.ledger.peek('project:csrf-1'), null, 'nothing was written');
    });

    test('sign-in itself is protected too', async () => {
        const { body } = await t.signUp({ email: 'csrf@example.com', username: 'csrf.user' });
        assert.ok(body);
        const r = await t.request('POST', '/api/auth/login', {
            json: { identifier: 'csrf@example.com', password: STRONG }, headers: { Origin: 'http://evil.example' }
        });
        assert.equal(r.status, 403);
        assert.equal(r.sid, null);
    });

    test('PUT, PATCH and DELETE are checked as well', async () => {
        const { cookie } = await t.signUp();
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
            const r = await t.request(method, '/api/tasks/t1', {
                cookie, json: {}, headers: { Origin: 'http://evil.example' }
            });
            assert.equal(r.status, 403, method);
        }
    });

    test('a different port or an unparseable Origin is also cross-site', async () => {
        const { cookie } = await t.signUp();
        for (const origin of ['http://127.0.0.1:1', 'null', 'not a url']) {
            const r = await t.request('POST', '/api/projects', { cookie, json: newProject('csrf-2'), headers: { Origin: origin } });
            assert.equal(r.status, 403, origin);
        }
    });

    test('same-origin requests pass', async () => {
        const { cookie } = await t.signUp();
        const r = await t.request('POST', '/api/projects', { cookie, json: newProject('csrf-ok') });
        assert.equal(r.status, 201);
    });

    test('requests with no Origin pass unless the browser says they are cross-site', async () => {
        const { cookie } = await t.signUp();
        const curl = await t.request('POST', '/api/projects', { cookie, json: newProject('csrf-curl'), sameOrigin: false });
        assert.equal(curl.status, 201, 'curl-style request');

        const cross = await t.request('POST', '/api/projects', {
            cookie, json: newProject('csrf-3'), sameOrigin: false, headers: { 'Sec-Fetch-Site': 'cross-site' }
        });
        assert.equal(cross.status, 403);

        for (const site of ['same-origin', 'none']) {
            const ok = await t.request('POST', '/api/projects', {
                cookie, json: newProject(`csrf-${site}`), sameOrigin: false, headers: { 'Sec-Fetch-Site': site }
            });
            assert.equal(ok.status, 201, site);
        }
    });

    test('GET requests are not affected by Origin', async () => {
        const r = await t.request('GET', '/api/auth/config', { headers: { Origin: 'http://evil.example' } });
        assert.equal(r.status, 200);
    });

    test('CORS is not enabled', async () => {
        const r = await t.request('GET', '/api/auth/config', { headers: { Origin: 'http://evil.example' } });
        assert.equal(r.headers['access-control-allow-origin'], undefined);
        const pre = await t.request('OPTIONS', '/api/projects', {
            headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'POST' }, sameOrigin: false
        });
        assert.equal(pre.headers['access-control-allow-origin'], undefined);
    });
});

describe('response headers', () => {
    test('security headers are present and X-Powered-By is gone', async () => {
        for (const [method, url] of [['GET', '/api/auth/config'], ['GET', '/api/auth/me'], ['GET', '/api/nope-at-all']]) {
            const r = await t.request(method, url);
            assert.equal(r.headers['x-content-type-options'], 'nosniff', url);
            assert.equal(r.headers['x-frame-options'], 'DENY', url);
            assert.equal(r.headers['referrer-policy'], 'strict-origin-when-cross-origin', url);
            assert.equal(r.headers['x-powered-by'], undefined, url);
        }
    });

    test('every /api response is Cache-Control: no-store', async () => {
        for (const [method, url] of [['GET', '/api/auth/config'], ['GET', '/api/auth/me'], ['GET', '/api/users'], ['GET', '/api/nope']]) {
            const r = await t.request(method, url);
            assert.equal(r.headers['cache-control'], 'no-store', url);
        }
    });
});

describe('request hygiene', () => {
    test('malformed JSON is a clean 400', async () => {
        for (const raw of ['{bad', '{"a":', 'null', '"just a string"', '12']) {
            const r = await t.request('POST', '/api/auth/login', { raw });
            assert.equal(r.status, 400, raw);
            assert.equal(typeof r.body.error, 'string');
        }
    });

    test('an oversized body is a clean 413', async () => {
        const raw = JSON.stringify({ identifier: 'a@example.com', password: 'x'.repeat(200 * 1024) });
        const r = await t.request('POST', '/api/auth/login', { raw });
        assert.equal(r.status, 413);
        assert.equal(typeof r.body.error, 'string');
    });

    test('odd bodies are never a 500', async () => {
        const bodies = [
            { raw: '[]' }, { raw: '{}' }, { json: { identifier: 123, password: 456 } },
            { json: { identifier: {}, password: [] } }, { json: { name: 5, email: {}, username: [], password: null } },
            { raw: 'hello', headers: { 'Content-Type': 'text/plain' } }, { raw: '' }
        ];
        for (const endpoint of ['/api/auth/login', '/api/auth/signup', '/api/auth/google', '/api/auth/email/verify']) {
            for (const body of bodies) {
                const r = await t.request('POST', endpoint, body);
                assert.ok(r.status < 500, `${endpoint} ${JSON.stringify(body)} -> ${r.status}`);
                assert.equal(typeof r.body.error, 'string');
            }
        }
    });

    test('odd query strings are never a 500', async () => {
        for (const url of ['/api/auth/username-available?u=%E0%A4%A', '/api/auth/username-available?u[]=a&u[]=b', '/api/auth/username-available?u[x]=1']) {
            const r = await t.request('GET', url);
            assert.ok(r.status < 500, `${url} -> ${r.status}`);
        }
    });
});

describe('rate limiting', () => {
    let rl;
    before(async () => { rl = await startTestApp({ config: { rateLimits: { authMax: 3, ipMax: 3, mailMax: 6 } } }); });
    after(async () => { await rl.close(); });

    const login = (identifier) => rl.request('POST', '/api/auth/login', { json: { identifier, password: 'Wrong!Password1' } });

    test('sign-in attempts are limited per identifier, with a friendly 429 and Retry-After', async () => {
        for (let i = 0; i < 3; i++) assert.equal((await login('limited@example.com')).status, 401);
        const blocked = await login('limited@example.com');
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers['retry-after']) > 0);
        assert.match(blocked.body.error, /Too many attempts/);
    });

    test('other identifiers and other endpoints are unaffected', async () => {
        assert.equal((await login('someone.else@example.com')).status, 401);
        assert.equal((await rl.request('GET', '/api/auth/config')).status, 200);
    });

    test('once the account is found, email and username share ONE budget (no extra attempts by alternating)', async () => {
        await rl.signUp({ email: 'both@example.com', username: 'both.ways' });
        const statuses = [];
        for (const id of ['both@example.com', 'both.ways', 'both@example.com', 'both.ways']) {
            statuses.push((await login(id)).status);
        }
        assert.deepEqual(statuses, [401, 401, 401, 429]);
    });

    test('sign-up attempts are limited per email too', async () => {
        const statuses = [];
        for (let i = 0; i < 4; i++) {
            statuses.push((await rl.request('POST', '/api/auth/signup', { json: { email: 'spam@example.com' } })).status);
        }
        assert.deepEqual(statuses, [400, 400, 400, 429]);
    });

    test('the username-availability endpoint has its own per-IP limit', async () => {
        const statuses = [];
        for (let i = 0; i < 4; i++) statuses.push((await rl.request('GET', `/api/auth/username-available?u=name${i}`)).status);
        assert.deepEqual(statuses, [200, 200, 200, 429]);
    });

    test('the Google endpoints are limited per IP', async () => {
        const g = await startTestApp({ googleProfiles: {}, config: { rateLimits: { authMax: 1000, ipMax: 2, mailMax: 6 } } });
        try {
            const statuses = [];
            for (let i = 0; i < 3; i++) statuses.push((await g.request('POST', '/api/auth/google', { json: { idToken: 'x' } })).status);
            assert.deepEqual(statuses, [401, 401, 429]);
        } finally { await g.close(); }
    });
});

describe('limiter window', () => {
    test('attempts are counted in a sliding window and allowed again afterwards', () => {
        let now = 1_000_000;
        const limiter = createLimiter({ windowMs: 1000, max: 2, now: () => now });
        assert.equal(limiter.hit('k').allowed, true);
        assert.equal(limiter.hit('k').allowed, true);
        const denied = limiter.hit('k');
        assert.equal(denied.allowed, false);
        assert.equal(denied.retryAfterSec, 1);
        assert.equal(limiter.hit('other').allowed, true, 'keys are independent');
        now += 1001;
        assert.equal(limiter.hit('k').allowed, true, 'the window has passed');
    });
});
