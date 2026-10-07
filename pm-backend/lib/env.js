'use strict';

// Tiny .env loader (no dependency): KEY=value lines, # comments, optional
// quotes. Real environment variables always win over the file. Secrets live
// only in .env (see .env.example) — never in source control.

const fs = require('node:fs');
const path = require('node:path');

function loadEnv(file = path.join(__dirname, '..', '.env')) {
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx < 0) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
    }
}

module.exports = { loadEnv };
