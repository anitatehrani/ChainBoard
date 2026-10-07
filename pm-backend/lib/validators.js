'use strict';

const { z } = require('zod');

// ── Username ────────────────────────────────────────────────────────────────
// Stored lower-case; a leading "@" is ignored everywhere.
const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,23}$/;
const RESERVED_USERNAMES = new Set([
    'admin', 'administrator', 'api', 'root', 'support', 'login', 'logout', 'signup',
    'signin', 'settings', 'help', 'about', 'me', 'user', 'users', 'system', 'null',
    'undefined', 'www', 'mail', 'email', 'account', 'accounts', 'security', 'official'
]);

function normalizeUsername(raw) {
    return String(raw == null ? '' : raw).trim().replace(/^@/, '').toLowerCase();
}

// Returns null when fine, otherwise a plain-English reason.
function usernameProblem(username) {
    if (!USERNAME_RE.test(username)) {
        return 'Username must be 3-24 characters: lowercase letters, digits, "." or "_", starting with a letter or digit.';
    }
    if (/[._]{2}/.test(username)) {
        return 'Username cannot have two "." or "_" characters next to each other.';
    }
    if (RESERVED_USERNAMES.has(username)) return 'That username is reserved. Please choose another one.';
    return null;
}

// Builds a valid, not-yet-checked username from an email's local part.
function usernameFromEmail(email, suffix = '') {
    let base = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '.');
    base = base.replace(/[._]{2,}/g, '.').replace(/^[._]+/, '').replace(/[._]+$/, '');
    if (base.length < 3) base = (base + 'user').slice(0, 8);
    const room = 24 - String(suffix).length;
    let candidate = base.slice(0, room).replace(/[._]+$/, '') + suffix;
    if (RESERVED_USERNAMES.has(candidate)) candidate = candidate + '1';
    return candidate;
}

// ── Phone ───────────────────────────────────────────────────────────────────
const PHONE_MESSAGE = 'Enter the phone number in international format, e.g. +49 170 1234567';

// Returns { ok: true, value } where value is '' (none given) or "+<digits>",
// or { ok: false, message }.
function normalizePhone(raw) {
    if (raw == null || String(raw).trim() === '') return { ok: true, value: '' };
    let s = String(raw).replace(/[\s().-]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (!/^\+[1-9]\d{6,14}$/.test(s)) return { ok: false, message: PHONE_MESSAGE };
    return { ok: true, value: s };
}

// ── Email / identifiers ─────────────────────────────────────────────────────
function normalizeEmail(raw) {
    return String(raw == null ? '' : raw).trim().toLowerCase();
}

const emailSchema = z.string().trim().toLowerCase().max(254, 'Email is too long.').email('Enter a valid email address.');

// ── Request schemas ─────────────────────────────────────────────────────────
const signupSchema = z.object({
    name: z.string().trim().min(1, 'Please enter your name.').max(80, 'Name must be at most 80 characters.'),
    email: emailSchema,
    username: z.string().min(1, 'Please choose a username.').max(60, 'Username is too long.'),
    phone: z.string().max(40, 'Phone number is too long.').optional().nullable(),
    password: z.string().min(1, 'Please enter a password.').max(1000, 'Password is too long.')
});

const loginSchema = z.object({
    identifier: z.string().max(254).optional(),
    email: z.string().max(254).optional(), // old field name, still accepted
    password: z.string().min(1, 'Enter your password.').max(1000)
});

function firstIssue(zodError) {
    const issue = zodError.issues && zodError.issues[0];
    return issue ? issue.message : 'Invalid request.';
}

module.exports = {
    normalizeUsername, usernameProblem, usernameFromEmail, normalizePhone, normalizeEmail,
    emailSchema, signupSchema, loginSchema, firstIssue, PHONE_MESSAGE, RESERVED_USERNAMES
};
