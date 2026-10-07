'use strict';

// Off-chain operational store: login sessions, email-confirmation tokens and
// the email log. These are deliberately NOT on the ledger — they are
// short-lived, high-churn infrastructure, not business records. Accounts and
// their security events (sign-up, password change, Google link/unlink, email
// confirmation) ARE on the ledger.
//
// Only SHA-256 hashes of tokens are ever stored, so a leaked store file
// cannot be used to impersonate anyone. When a file path is given the store
// is persisted (atomic write) so a backend restart does not sign everyone out.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;
const RENEW_AFTER = DAY;            // renew a session at most once a day
const LAST_SEEN_EVERY = 60 * 1000;  // touch last_seen at most once a minute
const EMAIL_TOKEN_TTL = DAY;
const MAX_EMAIL_LOG = 500;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
function newToken() {
    return crypto.randomBytes(32).toString('base64url');
}

class Store {
    constructor({ file = null, now = () => Date.now() } = {}) {
        this.file = file;
        this.now = now;
        this.sessions = new Map();     // tokenHash -> session
        this.emailTokens = new Map();  // tokenHash -> { email, purpose, address, expiresAt }
        this.emailLog = [];
        this.lastLogin = new Map();    // email -> ms
        this.lastSeen = new Map();     // email -> ms (not persisted)
        this._saveTimer = null;
        this._load();
    }

    // ── persistence ──
    _load() {
        if (!this.file || !fs.existsSync(this.file)) return;
        try {
            const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
            for (const [k, v] of Object.entries(data.sessions || {})) this.sessions.set(k, v);
            for (const [k, v] of Object.entries(data.emailTokens || {})) this.emailTokens.set(k, v);
            this.emailLog = data.emailLog || [];
            for (const [k, v] of Object.entries(data.lastLogin || {})) this.lastLogin.set(k, v);
        } catch (err) {
            console.error('Could not read session store, starting empty:', err.message);
        }
    }
    _scheduleSave() {
        if (!this.file) return;
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => { this._saveTimer = null; this.flush(); }, 200);
        if (this._saveTimer.unref) this._saveTimer.unref();
    }
    flush() {
        if (!this.file) return;
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            const data = {
                sessions: Object.fromEntries(this.sessions),
                emailTokens: Object.fromEntries(this.emailTokens),
                emailLog: this.emailLog,
                lastLogin: Object.fromEntries(this.lastLogin)
            };
            const tmp = `${this.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
            fs.renameSync(tmp, this.file);
        } catch (err) {
            console.error('Could not save session store:', err.message);
        }
    }

    // ── sessions ──
    createSession(email, userAgent = '') {
        const token = newToken();
        const now = this.now();
        this.sessions.set(sha256(token), {
            email,
            createdAt: now,
            renewedAt: now,
            expiresAt: now + SESSION_TTL,
            userAgent: String(userAgent).slice(0, 300)
        });
        this._scheduleSave();
        return token;
    }

    // Returns { hash, session } or null (missing / expired / malformed token).
    getSession(rawToken) {
        if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return null;
        const hash = sha256(rawToken);
        const session = this.sessions.get(hash);
        if (!session) return null;
        if (session.expiresAt <= this.now()) {
            this.sessions.delete(hash);
            this._scheduleSave();
            return null;
        }
        return { hash, session };
    }

    // Sliding expiry: returns true when the session was actually renewed.
    renewIfDue(hash) {
        const session = this.sessions.get(hash);
        if (!session) return false;
        const now = this.now();
        if (now - session.renewedAt < RENEW_AFTER) return false;
        session.renewedAt = now;
        session.expiresAt = now + SESSION_TTL;
        this._scheduleSave();
        return true;
    }

    deleteSession(rawToken) {
        if (typeof rawToken !== 'string') return false;
        const removed = this.sessions.delete(sha256(rawToken));
        if (removed) this._scheduleSave();
        return removed;
    }

    // Signs out every device except the one identified by keepHash.
    deleteOtherSessions(email, keepHash) {
        let count = 0;
        for (const [hash, s] of this.sessions) {
            if (s.email === email && hash !== keepHash) { this.sessions.delete(hash); count++; }
        }
        if (count) this._scheduleSave();
        return count;
    }

    purgeExpired() {
        const now = this.now();
        let count = 0;
        for (const [hash, s] of this.sessions) {
            if (s.expiresAt <= now) { this.sessions.delete(hash); count++; }
        }
        for (const [hash, t] of this.emailTokens) {
            if (t.expiresAt <= now) { this.emailTokens.delete(hash); count++; }
        }
        if (count) this._scheduleSave();
        return count;
    }

    recordLogin(email) {
        this.lastLogin.set(email, this.now());
        this._scheduleSave();
    }

    // True at most once a minute per user, so we don't churn on every request.
    touchLastSeen(email) {
        const now = this.now();
        const prev = this.lastSeen.get(email) || 0;
        if (now - prev < LAST_SEEN_EVERY) return false;
        this.lastSeen.set(email, now);
        return true;
    }

    // ── email confirmation tokens ──
    createEmailToken(email, purpose, address) {
        // Older tokens for the same user + purpose are discarded first.
        for (const [hash, t] of this.emailTokens) {
            if (t.email === email && t.purpose === purpose) this.emailTokens.delete(hash);
        }
        const token = newToken();
        this.emailTokens.set(sha256(token), {
            email, purpose, address, expiresAt: this.now() + EMAIL_TOKEN_TTL
        });
        this._scheduleSave();
        return token;
    }

    // Single use: deleting and returning in one step means a token can never
    // be spent twice.
    consumeEmailToken(rawToken, purpose) {
        if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return null;
        const hash = sha256(rawToken);
        const t = this.emailTokens.get(hash);
        if (!t || t.purpose !== purpose) return null;
        this.emailTokens.delete(hash);
        this._scheduleSave();
        if (t.expiresAt <= this.now()) return null;
        return t;
    }

    logEmail(entry) {
        this.emailLog.push({ at: new Date(this.now()).toISOString(), ...entry });
        if (this.emailLog.length > MAX_EMAIL_LOG) this.emailLog.splice(0, this.emailLog.length - MAX_EMAIL_LOG);
        this._scheduleSave();
    }
}

module.exports = { Store, sha256, SESSION_TTL, RENEW_AFTER, DAY };
