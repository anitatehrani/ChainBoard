'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../../createApp');
const { Store } = require('../../lib/store');
const { createMailer } = require('../../lib/mailer');
const { MockLedger } = require('./mockLedger');

// A password that satisfies every rule and contains no personal info.
const STRONG = 'Zebra!Coffee#2025x';

// Starts a real HTTP server around the real app, backed by the real chaincode
// on a mock stub. `clock` lets a test move time forward (session expiry etc.).
async function startTestApp({ config = {}, googleProfiles = null } = {}) {
    const clock = { ms: Date.now() };
    const ledger = new MockLedger({ clock: () => Math.floor(clock.ms / 1000) });
    const store = new Store({ now: () => clock.ms });
    const previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-mail-'));
    const mailer = createMailer({ previewDir });

    // googleProfiles: { 'good-token': { email, emailVerified, name, googleId, picture } }
    const googleVerifier = googleProfiles
        ? async (idToken) => {
            const profile = googleProfiles[idToken];
            if (!profile) throw new Error('invalid token');
            return { picture: '', name: '', ...profile };
        }
        : null;

    const app = createApp({
        ledger, store, mailer,
        config: {
            googleClientId: googleProfiles ? 'test-client-id.apps.googleusercontent.com' : null,
            googleVerifier,
            appUrl: 'http://localhost:5173',
            rateLimits: { authMax: 1000, ipMax: 1000, mailMax: 6 },
            ...config
        }
    });

    const server = await new Promise(resolve => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address();
    const origin = `http://127.0.0.1:${port}`;

    // Low-level request helper (node:http gives full control over headers).
    function request(method, urlPath, { json, raw, cookie, headers = {}, sameOrigin = true } = {}) {
        return new Promise((resolve, reject) => {
            const body = raw !== undefined ? raw : (json !== undefined ? JSON.stringify(json) : undefined);
            const h = { ...headers };
            if (body !== undefined) {
                h['Content-Type'] = h['Content-Type'] || 'application/json';
                h['Content-Length'] = Buffer.byteLength(body);
            }
            if (cookie) h.Cookie = `sid=${cookie}`;
            if (sameOrigin && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !h.Origin) h.Origin = origin;
            const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: h }, res => {
                let data = '';
                res.on('data', c => { data += c; });
                res.on('end', () => {
                    let parsed = null;
                    try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
                    const setCookie = res.headers['set-cookie'] || [];
                    const sid = setCookie.map(c => /^sid=([^;]*)/.exec(c)).find(Boolean);
                    resolve({
                        status: res.statusCode,
                        body: parsed,
                        headers: res.headers,
                        setCookie,
                        sid: sid ? sid[1] : null   // '' when the cookie is being cleared
                    });
                });
            });
            req.on('error', reject);
            if (body !== undefined) req.write(body);
            req.end();
        });
    }

    let counter = 0;
    // Creates an account through the real signup endpoint and returns its cookie.
    async function signUp(overrides = {}) {
        counter++;
        const body = {
            name: 'Test Person',
            email: `person${counter}@example.com`,
            username: `person${counter}x`,
            password: STRONG,
            ...overrides
        };
        const res = await request('POST', '/api/auth/signup', { json: body });
        if (res.status !== 201) throw new Error(`signUp failed: ${res.status} ${JSON.stringify(res.body)}`);
        return { cookie: res.sid, user: res.body.user, body, res };
    }

    async function close() {
        app.locals.stopTimers();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(previewDir, { recursive: true, force: true });
    }

    return { app, ledger, store, clock, request, signUp, close, origin, previewDir };
}

module.exports = { startTestApp, STRONG };
