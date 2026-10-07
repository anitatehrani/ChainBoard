'use strict';

// Password hashing and rules. Nothing here talks to the ledger: hashing is
// done ONCE, off-chain, and only the finished hash string is handed to the
// chaincode (chaincode must be deterministic, and a salted hash is not).

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// scrypt cost parameters. They are written INTO every stored hash
// ("scrypt$N$r$p$salt$key"), so the cost can be raised later while old
// hashes keep verifying with the parameters they were created with.
const N = 2 ** 15;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_INPUT = 1000; // cap what we ever feed into scrypt

function maxmemFor(n, r) { return 256 * n * r; } // generous headroom over 128*N*r

async function hashPassword(plain) {
    const input = String(plain).slice(0, MAX_INPUT);
    const salt = crypto.randomBytes(SALT_BYTES);
    const key = await scrypt(input, salt, KEY_BYTES, { N, r: R, p: P, maxmem: maxmemFor(N, R) });
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(plain, stored) {
    if (typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const n = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (![n, r, p].every(Number.isInteger) || n < 2 || r < 1 || p < 1) return false;
    let salt;
    let expected;
    try {
        salt = Buffer.from(parts[4], 'base64');
        expected = Buffer.from(parts[5], 'base64');
    } catch {
        return false;
    }
    if (!salt.length || !expected.length) return false;
    const input = String(plain).slice(0, MAX_INPUT);
    const actual = await scrypt(input, salt, expected.length, { N: n, r, p, maxmem: maxmemFor(n, r) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Unknown-user timing: when the account does not exist (or has no password),
// still do a full scrypt verification so response time does not reveal which
// emails/usernames are registered.
let dummyHashPromise = null;
async function verifyAgainstDummy(plain) {
    if (!dummyHashPromise) dummyHashPromise = hashPassword('dummy-password-for-timing-only');
    await verifyPassword(plain, await dummyHashPromise);
    return false;
}

// ── Password rules ──────────────────────────────────────────────────────────
// Identical on server and client (pm-frontend/src/lib/passwordRules.js). The
// server is the authority; a parity test proves the two copies agree.

const COMMON_PASSWORDS = [
    'password', 'passw0rd', 'password1', 'password12', 'password123', 'password1234',
    'qwerty', 'qwerty123', 'qwertyuiop', 'qwerty12345', '123456', '1234567', '12345678',
    '123456789', '1234567890', '111111', '000000', '123123', '654321', 'abc123',
    'abcd1234', 'abcdefgh', 'iloveyou', 'admin', 'admin123', 'administrator', 'welcome',
    'welcome1', 'welcome123', 'letmein', 'letmein123', 'monkey', 'dragon', 'football',
    'baseball', 'master', 'sunshine', 'princess', 'login', 'starwars', 'whatever',
    'trustno1', 'changeme', 'changeme123', 'secret', 'secret123', 'default', 'guest',
    'hunter2', 'superman', 'batman', 'shadow', 'michael', 'freedom', 'blockchain',
    'hyperledger', 'ledger', 'bitcoin', 'ethereum', 'summer2024', 'summer2025',
    'winter2024', 'winter2025', 'spring2025', 'autumn2025', 'iloveyou1', 'zaq12wsx',
    '1q2w3e4r', '1qaz2wsx', 'qazwsxedc', 'asdfghjkl', 'zxcvbnm', 'pass1234', 'test1234'
];
const COMMON_SET = new Set(COMMON_PASSWORDS);

function isCommon(password) {
    const lower = password.toLowerCase();
    if (COMMON_SET.has(lower)) return true;
    // "Password1!" -> "password" : strip everything that is not a letter
    const lettersOnly = lower.replace(/[^\p{L}]/gu, '');
    return lettersOnly.length >= 4 && COMMON_SET.has(lettersOnly);
}

function containsPersonal(password, value) {
    const v = String(value || '').trim().toLowerCase();
    return v.length >= 4 && password.toLowerCase().includes(v);
}

// Each rule: ok(password, ctx) -> boolean. ctx = { email, username, name }.
const PASSWORD_RULES = [
    { id: 'length-min', label: 'At least 10 characters',
      problem: 'Use at least 10 characters.',
      ok: (pw) => pw.length >= 10 },
    { id: 'length-max', label: 'No more than 128 characters',
      problem: 'Use at most 128 characters.',
      ok: (pw) => pw.length <= 128 },
    { id: 'lower', label: 'A lowercase letter',
      problem: 'Add a lowercase letter.',
      ok: (pw) => /\p{Ll}/u.test(pw) },
    { id: 'upper', label: 'An uppercase letter',
      problem: 'Add an uppercase letter.',
      ok: (pw) => /\p{Lu}/u.test(pw) },
    { id: 'digit', label: 'A number',
      problem: 'Add a number.',
      ok: (pw) => /\p{Nd}/u.test(pw) },
    { id: 'special', label: 'A special character (e.g. ! ? # $ %)',
      problem: 'Add a special character (for example ! ? # $ %).',
      ok: (pw) => /[^\p{L}\p{N}]/u.test(pw) },
    { id: 'common', label: 'Not a common password',
      problem: 'That password is too common. Choose something less guessable.',
      ok: (pw) => !isCommon(pw) },
    { id: 'no-email', label: 'Does not contain your email name',
      problem: 'Do not include your email name in the password.',
      ok: (pw, ctx) => !containsPersonal(pw, String((ctx && ctx.email) || '').split('@')[0]) },
    { id: 'no-username', label: 'Does not contain your username',
      problem: 'Do not include your username in the password.',
      ok: (pw, ctx) => !containsPersonal(pw, String((ctx && ctx.username) || '').replace(/^@/, '')) },
    { id: 'no-name', label: 'Does not contain your first name',
      problem: 'Do not include your first name in the password.',
      ok: (pw, ctx) => !containsPersonal(pw, String((ctx && ctx.name) || '').trim().split(/\s+/)[0]) }
];

// Returns the list of plain-English problems ([] when the password is fine).
function checkPassword(password, ctx = {}) {
    const pw = String(password == null ? '' : password);
    return PASSWORD_RULES.filter(rule => !rule.ok(pw, ctx)).map(rule => rule.problem);
}

module.exports = {
    hashPassword, verifyPassword, verifyAgainstDummy,
    PASSWORD_RULES, COMMON_PASSWORDS, checkPassword, MAX_INPUT
};
