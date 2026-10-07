'use strict';

// Builds the Express app. Everything it needs (ledger, session store, mailer,
// config) is passed in, so the real server (app.js) and the tests can use the
// exact same code with different dependencies.
//
// Request pipeline, in order:
//   security headers -> JSON body limit -> same-origin check -> authenticate
//   (attaches req.user, never rejects) -> public auth routes -> requireAuth
//   -> everything else.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const { LedgerError } = require('./lib/ledger');
const { buildReport } = require('./lib/audit');
const { hashPassword, verifyPassword, verifyAgainstDummy, checkPassword } = require('./lib/passwords');
const {
    normalizeUsername, usernameProblem, usernameFromEmail, normalizePhone, normalizeEmail,
    emailSchema, signupSchema, loginSchema, firstIssue
} = require('./lib/validators');
const { createLimiter, rejectIfLimited } = require('./lib/rateLimit');
const {
    COOKIE_NAME, securityHeaders, noStore, sameOriginOnly,
    parseCookies, setSessionCookie, clearSessionCookie
} = require('./lib/security');

const MIN = 60 * 1000;

function createApp({ ledger, store, mailer, config = {} }) {
    const cfg = {
        googleClientId: null,
        googleVerifier: null,
        appUrl: 'http://localhost:5173',
        cookieSecure: false,
        trustProxy: false,
        staticDir: null,
        ...config,
        rateLimits: {
            authMax: 15, authWindowMs: 15 * MIN,
            ipMax: 60, ipWindowMs: 15 * MIN,
            mailMax: 6, mailWindowMs: 60 * MIN,
            ...(config.rateLimits || {})
        }
    };

    const authLimiter = createLimiter({ windowMs: cfg.rateLimits.authWindowMs, max: cfg.rateLimits.authMax });
    const accountLimiter = createLimiter({ windowMs: cfg.rateLimits.authWindowMs, max: cfg.rateLimits.authMax });
    const ipLimiter = createLimiter({ windowMs: cfg.rateLimits.ipWindowMs, max: cfg.rateLimits.ipMax });
    const mailLimiter = createLimiter({ windowMs: cfg.rateLimits.mailWindowMs, max: cfg.rateLimits.mailMax });

    const app = express();
    app.disable('x-powered-by');
    if (cfg.trustProxy) app.set('trust proxy', cfg.trustProxy);

    app.use(securityHeaders);
    app.use(express.json({ limit: '100kb' }));
    app.use(sameOriginOnly);

    const api = express.Router();
    api.use(noStore);

    // ── helpers ────────────────────────────────────────────────────────────
    function publicUser(u) {
        return {
            email: u.email,
            name: u.name,
            username: u.username || '',
            phone: u.phone || '',
            avatar_url: u.googlePicture || '',
            has_password: !!u.passwordHash,
            google_linked: !!u.googleId,
            email_verified: !!u.emailVerifiedAt,
            created_at: u.createdAt || ''
        };
    }

    function statusFor(err) {
        if (!(err instanceof LedgerError)) return 500;
        if (err.kind === 'not-found') return 404;
        if (err.kind === 'conflict') return 409;
        if (err.kind === 'network') return 503;
        // The chaincode refuses an action the person is not allowed to do.
        if (/^Permission denied/i.test(err.message)) return 403;
        return 400;
    }

    function fail(res, err, forceStatus) {
        if (err instanceof LedgerError) {
            const message = err.kind === 'conflict'
                ? 'The ledger was busy with another change. Please try again.'
                : err.message;
            return res.status(forceStatus || statusFor(err)).json({ error: message });
        }
        console.error(err);
        return res.status(forceStatus || 500).json({ error: 'Something went wrong. Please try again.' });
    }

    const wrap = (handler) => (req, res) => {
        Promise.resolve(handler(req, res)).catch(err => fail(res, err));
    };

    function startSession(req, res, user) {
        const token = store.createSession(user.email, req.headers['user-agent'] || '');
        setSessionCookie(req, res, token, cfg.cookieSecure);
        return token;
    }

    async function loadUserOrNull(fn, arg) {
        try {
            return await ledger.evaluate(fn, arg);
        } catch (err) {
            if (err instanceof LedgerError && err.kind === 'not-found') return null;
            throw err;
        }
    }

    async function usernameTaken(username) {
        return !!(await loadUserOrNull('getUserByUsername', username));
    }

    const requireAuth = (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        next();
    };

    // authenticate: attaches req.user when the cookie holds a live session.
    // Forged, empty or malformed cookies are silently ignored — never an error.
    api.use((req, res, next) => {
        req.user = null;
        const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
        const found = token ? store.getSession(token) : null;
        if (found) {
            req.user = { email: found.session.email, sessionHash: found.hash };
            if (store.renewIfDue(found.hash)) setSessionCookie(req, res, token, cfg.cookieSecure);
            store.touchLastSeen(found.session.email);
        }
        next();
    });

    // ── PUBLIC AUTH ROUTES ─────────────────────────────────────────────────

    api.get('/auth/config', (req, res) => {
        res.json({ googleClientId: cfg.googleClientId || null });
    });

    api.get('/auth/username-available', wrap(async (req, res) => {
        if (rejectIfLimited(res, ipLimiter.hit(`avail|${req.ip}`))) return;
        const username = normalizeUsername(req.query.u);
        if (!username) return res.json({ available: false, reason: 'Choose a username.' });
        const problem = usernameProblem(username);
        if (problem) return res.json({ available: false, reason: problem });
        if (await usernameTaken(username)) return res.json({ available: false, reason: 'That username is already taken.' });
        res.json({ available: true, reason: null });
    }));

    // POST /auth/signup — creates the account as a REAL ledger transaction and
    // signs the person in immediately. The email does not need to be
    // verified to use the app.
    api.post('/auth/signup', wrap(async (req, res) => {
        const body = req.body || {};
        const limitKey = `signup|${req.ip}|${normalizeEmail(body.email)}`;
        if (rejectIfLimited(res, authLimiter.hit(limitKey))) return;

        const parsed = signupSchema.safeParse(body);
        if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
        const { name, email, password } = parsed.data;

        const username = normalizeUsername(parsed.data.username);
        const uProblem = usernameProblem(username);
        if (uProblem) return res.status(400).json({ error: uProblem });

        const phone = normalizePhone(parsed.data.phone);
        if (!phone.ok) return res.status(400).json({ error: phone.message });

        const problems = checkPassword(password, { email, username, name });
        if (problems.length) {
            return res.status(400).json({ error: 'Please choose a stronger password.', problems });
        }

        const passwordHash = await hashPassword(password);
        let user;
        try {
            user = await ledger.submit('registerUser', email, name, username, phone.value, passwordHash, 'email', '', '', 'false');
        } catch (err) {
            if (err instanceof LedgerError && err.kind === 'chaincode') {
                if (/Username @.* is already taken/i.test(err.message)) {
                    return res.status(409).json({ error: 'That username is already taken.' });
                }
                if (/phone number is already used/i.test(err.message)) {
                    return res.status(409).json({ error: 'That phone number is already used by another account.' });
                }
                if (/^User .* already exists$/i.test(err.message)) {
                    return res.status(409).json({ error: 'An account with this email already exists. Try signing in.' });
                }
            }
            throw err;
        }

        startSession(req, res, user);
        res.status(201).json({ user: publicUser(user) });
    }));

    // POST /auth/login — identifier is an email OR a username. Every failure
    // returns the same 401 with the same amount of work.
    api.post('/auth/login', wrap(async (req, res) => {
        const parsed = loginSchema.safeParse(req.body || {});
        if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
        const rawIdentifier = String(parsed.data.identifier ?? parsed.data.email ?? '').trim();
        if (!rawIdentifier) return res.status(400).json({ error: 'Enter your email or username.' });

        const isEmail = rawIdentifier.includes('@') && !/^@[^@]+$/.test(rawIdentifier);
        let identifier;
        if (isEmail) {
            const email = emailSchema.safeParse(rawIdentifier);
            if (!email.success) return res.status(400).json({ error: 'Enter a valid email address.' });
            identifier = email.data;
        } else {
            identifier = normalizeUsername(rawIdentifier);
        }

        if (rejectIfLimited(res, authLimiter.hit(`login|${req.ip}|${identifier}`))) return;

        const user = isEmail
            ? await loadUserOrNull('getUser', identifier)
            : await loadUserOrNull('getUserByUsername', identifier);

        // Once the account is found, ALSO limit by account, so alternating
        // between its email and its username gives no extra attempts.
        if (user && rejectIfLimited(res, accountLimiter.hit(`acct|${req.ip}|${user.email}`))) return;

        let ok = false;
        if (user && user.passwordHash) ok = await verifyPassword(parsed.data.password, user.passwordHash);
        else await verifyAgainstDummy(parsed.data.password); // same work, no timing leak

        if (!ok) return res.status(401).json({ error: 'Invalid email, username or password.' });

        store.recordLogin(user.email);
        startSession(req, res, user);
        res.json({ user: publicUser(user) });
    }));

    // POST /auth/logout — removes only THIS session. Harmless without one.
    api.post('/auth/logout', (req, res) => {
        const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
        if (token) store.deleteSession(token);
        clearSessionCookie(req, res, cfg.cookieSecure);
        res.status(204).end();
    });

    api.get('/auth/me', wrap(async (req, res) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        const user = await ledger.evaluate('getUser', req.user.email);
        res.json({ user: publicUser(user) });
    }));

    // POST /auth/google — both sign-in and sign-up. It must NEVER take over an
    // existing password account.
    api.post('/auth/google', wrap(async (req, res) => {
        if (rejectIfLimited(res, ipLimiter.hit(`google|${req.ip}`))) return;
        if (!cfg.googleVerifier) return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });

        const idToken = req.body && req.body.idToken;
        if (typeof idToken !== 'string' || !idToken) return res.status(400).json({ error: 'Missing Google token.' });

        let g;
        try { g = await cfg.googleVerifier(idToken); }
        catch { return res.status(401).json({ error: 'Google sign-in failed. Please try again.' }); }
        if (!g || !g.email || !g.googleId) return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
        if (!g.emailVerified) return res.status(401).json({ error: 'Your Google email address is not verified.' });

        // 1) Already linked to a Google account -> plain sign-in.
        const linked = await loadUserOrNull('getUserByGoogleId', g.googleId);
        if (linked) {
            store.recordLogin(linked.email);
            startSession(req, res, linked);
            return res.json({ user: publicUser(linked) });
        }

        // 2) Email already belongs to another account -> refuse (no takeover).
        const email = normalizeEmail(g.email);
        const existing = await loadUserOrNull('getUser', email);
        if (existing) {
            return res.status(409).json({
                error: 'An account with this email already exists. Sign in with your password, then connect Google from Settings.'
            });
        }

        // 3) Brand-new person -> create the account.
        const name = (g.name || email.split('@')[0]).trim().slice(0, 80) || email.split('@')[0];
        let user = null;
        for (let attempt = 0; attempt < 5 && !user; attempt++) {
            let username = null;
            for (let i = 0; i < 40 && !username; i++) {
                const candidate = usernameFromEmail(email, i === 0 ? '' : String(i + 1));
                if (usernameProblem(candidate)) continue;
                if (!(await usernameTaken(candidate))) username = candidate;
            }
            if (!username) username = usernameFromEmail(email, String(crypto.randomInt(1000, 9999)));
            try {
                user = await ledger.submit('registerUser', email, name, username, '', '', 'google', g.googleId, g.picture || '', 'true');
            } catch (err) {
                const racy = err instanceof LedgerError &&
                    (err.kind === 'conflict' || /already taken/i.test(err.message));
                if (!racy) throw err;
            }
        }
        if (!user) return res.status(409).json({ error: 'Could not create the account right now. Please try again.' });

        startSession(req, res, user);
        res.status(201).json({ user: publicUser(user) });
    }));

    // POST /auth/email/verify — public on purpose: opening the emailed link
    // proves control of the mailbox. The token is spent only when this is
    // called (the page shows a Confirm BUTTON), so mail scanners that merely
    // open the link cannot use it up.
    api.post('/auth/email/verify', wrap(async (req, res) => {
        const token = req.body && req.body.token;
        const record = store.consumeEmailToken(token, 'verify');
        if (!record) return res.status(400).json({ error: 'This confirmation link is invalid or has expired.' });
        const user = await loadUserOrNull('getUser', record.email);
        if (!user || user.email !== record.address) {
            return res.status(400).json({ error: 'This confirmation link is no longer valid.' });
        }
        const updated = await ledger.submit('markEmailVerified', record.email);
        res.json({ ok: true, user: publicUser(updated) });
    }));

    // ── EVERYTHING BELOW REQUIRES A SESSION ────────────────────────────────
    api.use(requireAuth);

    api.post('/auth/password', wrap(async (req, res) => {
        const body = req.body || {};
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
        const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        if (!newPassword || newPassword.length > 1000) {
            return res.status(400).json({ error: 'Please enter a new password.' });
        }

        const user = await ledger.evaluate('getUser', req.user.email);
        if (user.passwordHash) {
            const ok = currentPassword && await verifyPassword(currentPassword, user.passwordHash);
            if (!ok) return res.status(400).json({ error: 'Your current password is not correct.' });
        }

        const problems = checkPassword(newPassword, { email: user.email, username: user.username, name: user.name });
        if (problems.length) {
            return res.status(400).json({ error: 'Please choose a stronger password.', problems });
        }

        const hash = await hashPassword(newPassword);
        const updated = await ledger.submit('updatePasswordHash', user.email, hash);
        // Other devices are signed out; this one stays. The change itself is
        // permanently recorded in the account's security activity on the ledger.
        const signedOut = store.deleteOtherSessions(user.email, req.user.sessionHash);
        res.json({ ok: true, otherSessionsSignedOut: signedOut, user: publicUser(updated) });
    }));

    api.post('/auth/google/link', wrap(async (req, res) => {
        if (rejectIfLimited(res, ipLimiter.hit(`google|${req.ip}`))) return;
        if (!cfg.googleVerifier) return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
        const idToken = req.body && req.body.idToken;
        if (typeof idToken !== 'string' || !idToken) return res.status(400).json({ error: 'Missing Google token.' });

        let g;
        try { g = await cfg.googleVerifier(idToken); }
        catch { return res.status(401).json({ error: 'Google sign-in failed. Please try again.' }); }
        if (!g || !g.googleId) return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
        if (!g.emailVerified) return res.status(400).json({ error: 'Your Google email address is not verified.' });

        try {
            const updated = await ledger.submit('linkGoogle', req.user.email, g.googleId, g.picture || '');
            res.json({ user: publicUser(updated) });
        } catch (err) {
            if (err instanceof LedgerError && err.kind === 'chaincode') return fail(res, err, 409);
            throw err;
        }
    }));

    api.delete('/auth/google', wrap(async (req, res) => {
        try {
            const updated = await ledger.submit('unlinkGoogle', req.user.email);
            res.json({ user: publicUser(updated) });
        } catch (err) {
            if (err instanceof LedgerError && err.kind === 'chaincode') return fail(res, err, 400);
            throw err;
        }
    }));

    api.post('/auth/email/send-verification', wrap(async (req, res) => {
        if (rejectIfLimited(res, mailLimiter.hit(`mail|${req.user.email}`))) return;
        const user = await ledger.evaluate('getUser', req.user.email);
        if (user.emailVerifiedAt) return res.json({ ok: true, alreadyVerified: true });

        const token = store.createEmailToken(user.email, 'verify', user.email);
        const link = `${cfg.appUrl}/verify-email?token=${token}`;
        const subject = 'Confirm your email address';
        const text = `Hi ${user.name},\n\nPlease confirm your email address by opening this link:\n${link}\n\nThe link works once and expires in 24 hours. If you did not create this account you can ignore this message.\n`;
        const html = `<p>Hi ${user.name.replace(/[<>&]/g, '')},</p><p>Please confirm your email address:</p><p><a href="${link}">Confirm my email</a></p><p>The link works once and expires in 24 hours. If you did not create this account you can ignore this message.</p>`;
        const result = await mailer.send({ to: user.email, subject, text, html });
        store.logEmail({ to: user.email, subject, purpose: 'verify', mode: result.mode });

        const out = { ok: true };
        if (result.mode === 'preview') out.dev_link = link; // dev only: no mail server needed
        res.json(out);
    }));

    // The account's security activity (sign-up, password changes, Google
    // link/unlink, email confirmation) read straight from the ledger history.
    api.get('/auth/security-log', wrap(async (req, res) => {
        const history = await ledger.evaluate('getUserHistory', req.user.email);
        res.json({ events: history });
    }));

    api.get('/users', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getAllUsers'));
    }));

    // ── PROJECT ROUTES ─────────────────────────────────────────────────────
    // ownerId comes from the verified session, never from the request body.

    api.post('/projects', wrap(async (req, res) => {
        const { projectId, name, description } = req.body || {};
        if (!projectId || !name || !description) {
            return res.status(400).json({ error: 'Missing: projectId, name, description' });
        }
        res.status(201).json(await ledger.submit('createProject', projectId, name, description, req.user.email));
    }));

    // Defined BEFORE /projects/:id so Express does not treat "mine" as an :id.
    api.get('/projects/mine', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getMyProjects', req.user.email));
    }));

    api.get('/projects/:id', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getProject', req.params.id));
    }));

    api.post('/projects/:id/members', wrap(async (req, res) => {
        const { memberId, role } = req.body || {};
        if (!memberId || !role) return res.status(400).json({ error: 'Missing: memberId, role' });
        // The acting person comes from the session; the CHAINCODE checks their role.
        res.json(await ledger.submit('addProjectMember', req.params.id, memberId, role, req.user.email));
    }));

    // Every task of a project, read from the ledger (so a board does not depend on
    // a list remembered by the browser).
    api.get('/projects/:id/tasks', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getProjectTasks', req.params.id));
    }));

    api.get('/projects/:id/history', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getProjectHistory', req.params.id));
    }));

    api.delete('/projects/:id', wrap(async (req, res) => {
        res.json(await ledger.submit('archiveProject', req.params.id, req.user.email));
    }));

    // ── TASK ROUTES ────────────────────────────────────────────────────────

    api.post('/tasks', wrap(async (req, res) => {
        const { taskId, projectId, title, description, priority, dueDate } = req.body || {};
        if (!taskId || !projectId || !title || !description || !priority) {
            return res.status(400).json({ error: 'Missing: taskId, projectId, title, description, priority' });
        }
        res.status(201).json(await ledger.submit('createTask', taskId, projectId, title, description, priority, dueDate || '', req.user.email));
    }));

    api.get('/tasks/:id', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getTask', req.params.id));
    }));

    api.put('/tasks/:id/assign', wrap(async (req, res) => {
        const { assigneeId } = req.body || {};
        if (!assigneeId) return res.status(400).json({ error: 'Missing: assigneeId' });
        res.json(await ledger.submit('assignTask', req.params.id, assigneeId, req.user.email));
    }));

    api.put('/tasks/:id/status', wrap(async (req, res) => {
        const { status } = req.body || {};
        if (!status) return res.status(400).json({ error: 'Missing: status' });
        res.json(await ledger.submit('updateTaskStatus', req.params.id, status, req.user.email));
    }));

    api.put('/tasks/:id/meta', wrap(async (req, res) => {
        const { field, value } = req.body || {};
        if (!field || value === undefined) return res.status(400).json({ error: 'Missing: field, value' });
        res.json(await ledger.submit('updateTaskMeta', req.params.id, field, value, req.user.email));
    }));

    api.delete('/tasks/:id', wrap(async (req, res) => {
        res.json(await ledger.submit('archiveTask', req.params.id, req.user.email));
    }));

    // authorId comes from the verified session, never from the body.
    api.post('/tasks/:id/comments', wrap(async (req, res) => {
        const { text } = req.body || {};
        if (!text) return res.status(400).json({ error: 'Missing: text' });
        res.json(await ledger.submit('addComment', req.params.id, req.user.email, text));
    }));

    api.get('/tasks/:id/history', wrap(async (req, res) => {
        res.json(await ledger.evaluate('getTaskHistory', req.params.id));
    }));

    // Audit report: the full history, a SHA-256 digest chain over it, and a check of
    // every transaction id against the peer. ?download=1 sends it as a file.
    async function auditReport(kind, id, history) {
        const txIds = [...new Set(history.map(h => h.txId))];
        const checks = {};
        // a few at a time so a long history does not open dozens of connections at once
        for (let i = 0; i < txIds.length; i += 4) {
            const batch = txIds.slice(i, i + 4);
            const results = await Promise.all(batch.map(tx => (
                // a record without a transaction id cannot be checked: "unknown", never "missing"
                tx && typeof ledger.checkTx === 'function' ? ledger.checkTx(tx).catch(() => null) : Promise.resolve(null)
            )));
            batch.forEach((tx, j) => { checks[tx] = results[j]; });
        }
        return buildReport({ kind, id, history, txChecks: checks });
    }
    function sendReport(req, res, report) {
        if (req.query.download) {
            res.setHeader('Content-Disposition', `attachment; filename="audit-${report.kind}-${String(report.id).replace(/[^\w.-]/g, '_')}.json"`);
        }
        res.json(report);
    }
    api.get('/tasks/:id/audit', wrap(async (req, res) => {
        const history = await ledger.evaluate('getTaskHistory', req.params.id);
        if (!history.length) return res.status(404).json({ error: `Task ${req.params.id} does not exist` });
        sendReport(req, res, await auditReport('task', req.params.id, history));
    }));
    api.get('/projects/:id/audit', wrap(async (req, res) => {
        const history = await ledger.evaluate('getProjectHistory', req.params.id);
        if (!history.length) return res.status(404).json({ error: `Project ${req.params.id} does not exist` });
        sendReport(req, res, await auditReport('project', req.params.id, history));
    }));

    api.post('/tasks/:id/files', wrap(async (req, res) => {
        const { fileName, ipfsCid } = req.body || {};
        if (!fileName || !ipfsCid) return res.status(400).json({ error: 'Missing: fileName, ipfsCid' });
        res.json(await ledger.submit('attachFile', req.params.id, fileName, ipfsCid, req.user.email));
    }));

    api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
    app.use('/api', api);

    // Optional: serve the built React client (npm run build) from the same
    // origin in production, so cookies and the CSRF check work unchanged.
    if (cfg.staticDir && fs.existsSync(path.join(cfg.staticDir, 'index.html'))) {
        app.use(express.static(cfg.staticDir));
        app.get('/{*splat}', (req, res) => res.sendFile(path.join(cfg.staticDir, 'index.html')));
    }

    // Bad JSON is a clean 400, oversized bodies a clean 413, odd bodies never a 500.
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
        if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' });
        if (err && err.status && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: 'Bad request.' });
        console.error(err);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    });

    // Housekeeping timers (unref'd so they never keep the process alive).
    const timers = [
        setInterval(() => store.purgeExpired(), 60 * MIN),
        setInterval(() => { authLimiter.sweep(); accountLimiter.sweep(); ipLimiter.sweep(); mailLimiter.sweep(); }, 10 * MIN)
    ];
    timers.forEach(t => t.unref && t.unref());
    app.locals.stopTimers = () => timers.forEach(clearInterval);

    return app;
}

module.exports = { createApp };
