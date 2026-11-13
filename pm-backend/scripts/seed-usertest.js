#!/usr/bin/env node
'use strict';

// Prepares the data for ONE user-test session (the printed task sheet).
//
//   node scripts/seed-usertest.js 1     -> account tester1, project "Conference Website"
//   node scripts/seed-usertest.js 2     -> account tester2, its own fresh copy of the project
//
// Each participant changes the tasks (assigns, moves to Done, ...), and the ledger
// cannot be reset, so every participant gets their own number and their own copy.
// Everything is created through the normal HTTP API, i.e. as real transactions.
//
// What the task sheet needs:
//   - tester<n> is a CONTRIBUTOR of "Conference Website"
//   - "Design sponsor banner": overdue, To Do, unassigned  (steps 3-9)
//   - "Collect sponsor logos": Done by Marco Rossi          (step 10)
//   - "Book venue": assigned to Marco, In progress          (step 12: must be refused)

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Blockchain&IPFS-Genova-2026';
const TESTER_PASSWORD = process.env.TESTER_PASSWORD || 'Genova-Test#2026';

//   node scripts/seed-usertest.js 9 --fresh
//       -> keeps account tester9 but gives it a NEW copy of the project. The ledger cannot
//          delete anything, so the old copy(s) are archived (kept for the record, hidden
//          from the participant's active list) and the new one gets the id conf-9-2, -3, ...
const args = process.argv.slice(2);
const FRESH = args.includes('--fresh');
const n = Number(args.find(a => !a.startsWith('--')) || 1);
if (!Number.isInteger(n) || n < 1 || n > 99) {
    console.error('Usage: node scripts/seed-usertest.js <participant number 1-99> [--fresh]');
    process.exit(1);
}

const PEOPLE = {
    anita: { name: 'Anita Tehrani', username: 'anita.tehrani', email: 'anita.tehrani@example.com', password: DEMO_PASSWORD },
    marco: { name: 'Marco Rossi', username: 'marco.rossi', email: 'marco.rossi@example.com', password: DEMO_PASSWORD },
    giulia: { name: 'Giulia Bianchi', username: 'giulia.bianchi', email: 'giulia.bianchi@example.com', password: DEMO_PASSWORD },
    // first name must not appear in the password (password rules), so not "Test ..."
    tester: { name: `Guest Participant ${n}`, username: `tester${n}`, email: `tester${n}@example.com`, password: TESTER_PASSWORD }
};

function dayOffset(d) {
    const x = new Date();
    x.setDate(x.getDate() + d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

class Client {
    constructor() { this.cookie = ''; }
    async call(method, path, body) {
        const res = await fetch(`${BASE}/api${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Origin: BASE, ...(this.cookie ? { Cookie: this.cookie } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
        for (const c of set) if (c.startsWith('sid=')) this.cookie = c.split(';')[0];
        let data = null;
        try { data = await res.json(); } catch { /* empty */ }
        return { status: res.status, data };
    }
}

async function step(label, promise) {
    const { status, data } = await promise;
    if (status >= 200 && status < 300) { console.log(`  + ${label}`); return data; }
    const message = (data && data.error) || `HTTP ${status}`;
    console.log(`  ! ${label}: ${message}`);
    throw new Error(`${label}: ${message}`);
}

async function account(key) {
    const p = PEOPLE[key];
    const c = new Client();
    const r = await c.call('POST', '/auth/signup', { name: p.name, email: p.email, username: p.username, password: p.password });
    if (r.status === 201) { console.log(`  + account ${p.name} (@${p.username})`); return c; }
    const login = await c.call('POST', '/auth/login', { identifier: p.email, password: p.password });
    if (login.status === 200) { console.log(`  = account ${p.name} (already there)`); return c; }
    throw new Error(`${p.name}: ${(r.data && r.data.error) || r.status} / ${(login.data && login.data.error) || login.status}`);
}

async function main() {
    const probe = await new Client().call('GET', '/auth/config').catch(() => null);
    if (!probe || probe.status !== 200) {
        console.error(`Cannot reach the backend at ${BASE}. Start it first (bash start.sh).`);
        process.exit(1);
    }

    console.log(`User test, participant ${n}\n\nAccounts`);
    const anita = await account('anita');
    const marco = await account('marco');
    await account('giulia');
    await account('tester');
    const E = (k) => PEOPLE[k].email;

    let pid = `conf-${n}`;
    const exists = await anita.call('GET', `/projects/${pid}`);
    if (exists.status === 200) {
        if (!FRESH) {
            console.log(`\nProject ${pid} already exists, so participant ${n} was already prepared.`);
            console.log(`For a new copy for the same participant: node scripts/seed-usertest.js ${n} --fresh`);
            console.log(`Or use the next number:                   node scripts/seed-usertest.js ${n + 1}`);
            return;
        }
        // Archive every earlier copy and find the first free id.
        console.log('\nEarlier copies');
        for (let k = 1; ; k++) {
            const id = k === 1 ? `conf-${n}` : `conf-${n}-${k}`;
            const r = await anita.call('GET', `/projects/${id}`);
            if (r.status !== 200) { pid = id; break; }
            if (r.data && r.data.status === 'archived') { console.log(`  = ${id} already archived`); continue; }
            await step(`archive ${id}`, anita.call('DELETE', `/projects/${id}`));
        }
    }

    console.log('\nProject: Conference Website');
    await step('project', anita.call('POST', '/projects', {
        projectId: pid, name: 'Conference Website',
        description: 'Website and logistics for the yearly student conference in Genova.'
    }));
    await step('Marco as admin', anita.call('POST', `/projects/${pid}/members`, { memberId: E('marco'), role: 'admin' }));
    await step('Giulia as contributor', anita.call('POST', `/projects/${pid}/members`, { memberId: E('giulia'), role: 'contributor' }));
    await step(`tester${n} as contributor`, anita.call('POST', `/projects/${pid}/members`, { memberId: E('tester'), role: 'contributor' }));

    const task = (id, title, description, priority, due) => step(`task: ${title}`, anita.call('POST', '/tasks', {
        taskId: `${pid}-${id}`, projectId: pid, title, description, priority, dueDate: due
    }));
    const T = (id) => `${pid}-${id}`;

    // steps 3-9: overdue, To Do, nobody assigned
    await task('banner', 'Design sponsor banner', 'Banner for the website header with the sponsor logos.', 'high', dayOffset(-3));

    // step 10: finished by Marco, with a short history
    await task('logos', 'Collect sponsor logos', 'Get the logos in SVG from all five sponsors.', 'medium', dayOffset(-5));
    await step('  assign to Marco', anita.call('PUT', `/tasks/${T('logos')}/assign`, { assigneeId: E('marco') }));
    await step('  Marco: In progress', marco.call('PUT', `/tasks/${T('logos')}/status`, { status: 'in-progress' }));
    await step('  Marco: comment', marco.call('POST', `/tasks/${T('logos')}/comments`, { text: 'All five logos received, uploaded to the shared folder.' }));
    await step('  Marco: Done', marco.call('PUT', `/tasks/${T('logos')}/status`, { status: 'done' }));

    // step 12: belongs to Marco, so a contributor must be refused
    await task('venue', 'Book venue', 'Reserve the main hall for the conference day.', 'high', dayOffset(7));
    await step('  assign to Marco', anita.call('PUT', `/tasks/${T('venue')}/assign`, { assigneeId: E('marco') }));
    await step('  Marco: In progress', marco.call('PUT', `/tasks/${T('venue')}/status`, { status: 'in-progress' }));

    // background tasks so the board looks real
    await task('invites', 'Send speaker invitations', 'Email the four invited speakers with date and schedule.', 'medium', dayOffset(4));
    await step('  assign to Giulia', anita.call('PUT', `/tasks/${T('invites')}/assign`, { assigneeId: E('giulia') }));
    await task('register', 'Set up registration page', 'Simple form, name and e-mail.', 'low', '');

    console.log(`\nReady. Participant ${n} signs in at http://localhost:5173 with`);
    console.log(`  username  tester${n}`);
    console.log(`  password  ${TESTER_PASSWORD}`);
}

main().catch(err => { console.error('\nSeed stopped:', err.message); process.exit(1); });
