'use strict';

const COOKIE_NAME = 'sid';
const COOKIE_MAX_AGE_SEC = 30 * 24 * 60 * 60;

function securityHeaders(req, res, next) {
    res.removeHeader('X-Powered-By');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
}

// Responses from /api must never be cached (they can contain personal data).
function noStore(req, res, next) {
    res.set('Cache-Control', 'no-store');
    next();
}

// CSRF protection without tokens: browsers always send Origin on cross-site
// POST/PUT/PATCH/DELETE, so a state-changing request whose Origin host is not
// our own host is refused. Requests with no Origin (curl, server-to-server)
// are allowed unless the browser says they are cross-site. No CORS is enabled.
// This protects the login endpoint too.
function sameOriginOnly(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
        let host = '';
        try { host = new URL(origin).host; } catch { host = ''; }
        if (!host || host !== req.headers.host) {
            return res.status(403).json({ error: 'Cross-site request blocked.' });
        }
        return next();
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
        return res.status(403).json({ error: 'Cross-site request blocked.' });
    }
    next();
}

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of String(header).split(';')) {
        const idx = part.indexOf('=');
        if (idx < 0) continue;
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (key && !(key in out)) {
            try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
        }
    }
    return out;
}

function isSecureRequest(req, cookieSecure) {
    if (cookieSecure) return true;
    if (req.secure) return true;
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    return proto === 'https';
}

function setSessionCookie(req, res, token, cookieSecure) {
    let cookie = `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}`;
    if (isSecureRequest(req, cookieSecure)) cookie += '; Secure';
    res.append('Set-Cookie', cookie);
}

function clearSessionCookie(req, res, cookieSecure) {
    let cookie = `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
    if (isSecureRequest(req, cookieSecure)) cookie += '; Secure';
    res.append('Set-Cookie', cookie);
}

module.exports = {
    COOKIE_NAME, securityHeaders, noStore, sameOriginOnly,
    parseCookies, setSessionCookie, clearSessionCookie
};
