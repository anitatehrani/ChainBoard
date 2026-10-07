'use strict';

// Entry point: `node app.js`. Wires the real Fabric ledger, the on-disk
// session store and the mailer into the app built by createApp.js.

const path = require('node:path');
const { loadEnv } = require('./lib/env');
loadEnv();

const { createApp } = require('./createApp');
const { createFabricLedger } = require('./lib/ledger');
const { Store } = require('./lib/store');
const { createMailer } = require('./lib/mailer');
const { createGoogleVerifier } = require('./auth');

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const PORT = Number(process.env.PORT) || 3000;

const ledger = createFabricLedger({
    channel: 'mychannel',
    chaincode: 'pmcc',
    mspId: 'Org1MSP',
    peerAddr: 'localhost:7051',
    peerHost: 'peer0.org1.example.com'
});

const store = new Store({ file: path.join(__dirname, 'data', 'sessions.json') });

const mailer = createMailer({
    smtp: process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    } : null,
    previewDir: path.join(__dirname, 'data', 'mail-preview'),
    from: process.env.MAIL_FROM || 'ChainBoard <no-reply@localhost>'
});

const app = createApp({
    ledger, store, mailer,
    config: {
        googleClientId: googleClientId || null,
        googleVerifier: createGoogleVerifier(googleClientId),
        appUrl: process.env.APP_URL || 'http://localhost:5173',
        cookieSecure: process.env.COOKIE_SECURE === 'true',
        trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false,
        staticDir: path.join(__dirname, '..', 'pm-frontend', 'dist')
    }
});

const server = app.listen(PORT, () => {
    console.log(`PM Backend API running on http://localhost:${PORT}  (mail: ${mailer.mode}${googleClientId ? ', Google sign-in on' : ''})`);
});

function shutdown() {
    store.flush();
    server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
