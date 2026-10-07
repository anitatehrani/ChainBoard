'use strict';

// Mail transport. With SMTP_HOST set, real mail is sent through nodemailer.
// Otherwise "preview" mode writes each message as .html/.txt into a folder and
// returns the file path, so development needs no mail server.

const fs = require('node:fs');
const path = require('node:path');

function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mail';
}

function createMailer({ smtp = null, previewDir, from = 'ChainBoard <no-reply@localhost>' }) {
    let transport = null;
    if (smtp && smtp.host) {
        const nodemailer = require('nodemailer'); // only needed when SMTP is configured
        transport = nodemailer.createTransport({
            host: smtp.host,
            port: Number(smtp.port) || 587,
            secure: Number(smtp.port) === 465,
            auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
        });
    }

    return {
        mode: transport ? 'smtp' : 'preview',
        async send({ to, subject, text, html }) {
            if (transport) {
                await transport.sendMail({ from, to, subject, text, html });
                return { mode: 'smtp' };
            }
            fs.mkdirSync(previewDir, { recursive: true });
            const base = path.join(previewDir, `${Date.now()}-${slug(subject)}-${slug(to)}`);
            fs.writeFileSync(`${base}.txt`, `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
            fs.writeFileSync(`${base}.html`, html || `<pre>${text}</pre>`);
            return { mode: 'preview', file: `${base}.html` };
        }
    };
}

module.exports = { createMailer };
