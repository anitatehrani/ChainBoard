#!/usr/bin/env node
'use strict';

// Fills the running system with demo data so every screen has something to show.
//
// It talks to the backend through its normal HTTP API (the same calls the web
// app makes), so every account, project and task is created by a REAL
// blockchain transaction — nothing is written to the ledger any other way.
//
//   1. start the network + chaincode and the backend (node app.js)
//   2. node scripts/seed-demo.js            (optionally: BASE_URL=http://localhost:3000)
//
// Safe to run twice: things that already exist are skipped. Dates are relative
// to today, so "overdue", "due today" and "due soon" always show up.

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PASSWORD = process.env.DEMO_PASSWORD || 'Blockchain&IPFS-Genova-2026';

const PEOPLE = {
    anita: { name: 'Anita Tehrani', username: 'anita.tehrani', email: 'anita.tehrani@example.com', phone: '+39 347 1234567' },
    marco: { name: 'Marco Rossi', username: 'marco.rossi', email: 'marco.rossi@example.com' },
    giulia: { name: 'Giulia Bianchi', username: 'giulia.bianchi', email: 'giulia.bianchi@example.com' },
    sara: { name: 'Sara Conti', username: 'sara.conti', email: 'sara.conti@example.com' },
    luca: { name: 'Luca Ferrari', username: 'luca.ferrari', email: 'luca.ferrari@example.com' }
};

function dayOffset(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

// ── tiny cookie-keeping HTTP client (one per person) ─────────────────────────
class Client {
    constructor(label) { this.label = label; this.cookie = ''; }

    async call(method, path, body) {
        const res = await fetch(`${BASE}/api${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                // The backend's CSRF check compares Origin with Host.
                Origin: BASE,
                ...(this.cookie ? { Cookie: this.cookie } : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
        for (const c of set) {
            if (c.startsWith('sid=')) this.cookie = c.split(';')[0];
        }
        let data = null;
        try { data = await res.json(); } catch { /* 204 */ }
        return { status: res.status, data };
    }
}

let created = 0;
let skipped = 0;

async function step(label, promise) {
    const { status, data } = await promise;
    if (status >= 200 && status < 300) { created += 1; console.log(`  + ${label}`); return data; }
    const message = (data && data.error) || `HTTP ${status}`;
    if (/already exists|already in project|already taken|already used/i.test(message)) {
        skipped += 1; console.log(`  = ${label} (already there)`); return null;
    }
    console.log(`  ! ${label}: ${message}`);
    throw new Error(`${label}: ${message}`);
}

async function signUpOrLogIn(key) {
    const p = PEOPLE[key];
    const c = new Client(key);
    const r = await c.call('POST', '/auth/signup', {
        name: p.name, email: p.email, username: p.username, phone: p.phone, password: PASSWORD
    });
    if (r.status === 201) { created += 1; console.log(`  + account ${p.name} (@${p.username})`); return c; }
    const login = await c.call('POST', '/auth/login', { identifier: p.email, password: PASSWORD });
    if (login.status === 200) { skipped += 1; console.log(`  = account ${p.name} (already there)`); return c; }
    throw new Error(`${p.name}: ${(r.data && r.data.error) || r.status} / ${(login.data && login.data.error) || login.status}`);
}

async function main() {
    const health = await new Client('probe').call('GET', '/auth/config').catch(() => null);
    if (!health || health.status !== 200) {
        console.error(`Cannot reach the backend at ${BASE}. Start it first: cd pm-backend && node app.js`);
        process.exit(1);
    }

    console.log('Accounts');
    const anita = await signUpOrLogIn('anita');
    const marco = await signUpOrLogIn('marco');
    const giulia = await signUpOrLogIn('giulia');
    const sara = await signUpOrLogIn('sara');
    const luca = await signUpOrLogIn('luca');
    const E = (k) => PEOPLE[k].email;

    // Re-running must not pile up duplicate comments, so stop if the demo data is already there.
    const probe = await anita.call('GET', '/projects/demo-thesis');
    if (probe.status === 200) {
        console.log('\nDemo data is already in the ledger — nothing more to add.');
        console.log(`Sign in as ${PEOPLE.anita.username} (or ${PEOPLE.anita.email}), password: ${PASSWORD}`);
        console.log('To start over, wipe the network and redeploy the chaincode (the ledger cannot be edited).');
        return;
    }

    // ── Project 1: Anita owns it, a full board ────────────────────────────────
    console.log('\nProject: Thesis Platform (Anita owner)');
    await step('project', anita.call('POST', '/projects', {
        projectId: 'demo-thesis', name: 'Thesis Platform',
        description: 'ChainBoard: decentralized project management on Hyperledger Fabric and IPFS: chaincode, backend and web client.'
    }));
    await step('Marco as admin', anita.call('POST', '/projects/demo-thesis/members', { memberId: E('marco'), role: 'admin' }));
    await step('Giulia as contributor', anita.call('POST', '/projects/demo-thesis/members', { memberId: E('giulia'), role: 'contributor' }));
    await step('Sara as contributor', anita.call('POST', '/projects/demo-thesis/members', { memberId: E('sara'), role: 'contributor' }));

    const T = (id, title, description, priority, due) => step(`task ${id}`, anita.call('POST', '/tasks', {
        taskId: id, projectId: 'demo-thesis', title, description, priority, dueDate: due
    }));
    const assign = (id, who) => step(`  assign ${id}`, anita.call('PUT', `/tasks/${id}/assign`, { assigneeId: E(who) }));
    const status = (client, id, s) => step(`  ${id} → ${s}`, client.call('PUT', `/tasks/${id}/status`, { status: s }));
    const comment = (client, id, text) => step(`  comment on ${id}`, client.call('POST', `/tasks/${id}/comments`, { text }));

    // overdue, still to do
    await T('demo-t01', 'Write the chapter on consensus', 'Explain execute-order-validate and why Raft is used for ordering.', 'high', dayOffset(-4));
    await assign('demo-t01', 'anita');
    await comment(marco, 'demo-t01', 'Please add a short diagram of the transaction flow.');

    // overdue, in progress (also changes priority and due date for the audit trail)
    await T('demo-t02', 'Chaincode unit tests', 'Run the real chaincode on a mock stub and cover every error path.', 'high', dayOffset(-1));
    await assign('demo-t02', 'giulia');
    await status(giulia, 'demo-t02', 'in-progress');
    await step('  raise priority', anita.call('PUT', '/tasks/demo-t02/meta', { field: 'priority', value: 'high' }));
    await comment(giulia, 'demo-t02', 'Mock stub covers registerUser and the index keys; project functions next.');

    // due today
    await T('demo-t03', 'Prepare the advisor meeting slides', 'Ten slides: problem, architecture, demo, results, next steps.', 'medium', dayOffset(0));
    await assign('demo-t03', 'anita');
    await status(anita, 'demo-t03', 'in-progress');

    // due tomorrow
    await T('demo-t04', 'Review the login security notes', 'Check AUTH.md against what the code really does.', 'medium', dayOffset(1));
    await assign('demo-t04', 'sara');

    // due in 5 days
    await T('demo-t05', 'Attach IPFS test results', 'Upload the benchmark output and link the CID to the task.', 'low', dayOffset(5));
    await assign('demo-t05', 'marco');
    await step('  attach file', marco.call('POST', '/tasks/demo-t05/files', {
        fileName: 'ipfs-benchmark.csv', ipfsCid: 'QmDemoBenchmark1111111111111111111111111111111'
    }));
    await step('  attach second file', marco.call('POST', '/tasks/demo-t05/files', {
        fileName: 'latency-plot.png', ipfsCid: 'QmDemoLatencyPlot22222222222222222222222222222'
    }));

    // far in the future, unassigned
    await T('demo-t06', 'Final formatting of the thesis PDF', 'Margins, references, list of figures.', 'low', dayOffset(30));

    // no due date, unassigned
    await T('demo-t07', 'Ideas for future work', 'Private data collections, attribute-based access control.', 'low', '');

    // done (shows the quiet card + audit trail with several transactions)
    await T('demo-t08', 'Set up the Fabric test network', 'Two orgs, one channel, chaincode deployed.', 'high', dayOffset(-10));
    await assign('demo-t08', 'marco');
    await status(marco, 'demo-t08', 'in-progress');
    await comment(marco, 'demo-t08', 'Network is up; chaincode v1.0 sequence 1 committed.');
    await status(marco, 'demo-t08', 'done');

    await T('demo-t09', 'Choose the frontend stack', 'React + Vite, same-origin API proxy.', 'medium', dayOffset(-12));
    await assign('demo-t09', 'giulia');
    await status(giulia, 'demo-t09', 'in-progress');
    await status(giulia, 'demo-t09', 'done');

    // archived task
    await T('demo-t10', 'Evaluate a second blockchain', 'Dropped: out of scope for the thesis.', 'low', dayOffset(-3));
    await step('  archive task', anita.call('DELETE', '/tasks/demo-t10'));

    // reopened task: done → in-progress shows in the audit trail
    await T('demo-t11', 'Add password strength rules', 'Same rules in the browser and on the server.', 'medium', dayOffset(3));
    await assign('demo-t11', 'sara');
    await status(sara, 'demo-t11', 'in-progress');
    await status(sara, 'demo-t11', 'done');
    await status(sara, 'demo-t11', 'in-progress');
    await comment(anita, 'demo-t11', 'Reopened: the checklist must also reject passwords containing the username.');

    // ── Project 2: Marco owns it, Anita is an admin ───────────────────────────
    console.log('\nProject: Fabric Chaincode Hardening (Marco owner, Anita admin)');
    await step('project', marco.call('POST', '/projects', {
        projectId: 'demo-hardening', name: 'Fabric Chaincode Hardening',
        description: 'Determinism review, index keys instead of queries, and an audit of every state change.'
    }));
    await step('Anita as admin', marco.call('POST', '/projects/demo-hardening/members', { memberId: E('anita'), role: 'admin' }));
    await step('Luca as contributor', marco.call('POST', '/projects/demo-hardening/members', { memberId: E('luca'), role: 'contributor' }));
    const H = (id, title, description, priority, due) => step(`task ${id}`, marco.call('POST', '/tasks', {
        taskId: id, projectId: 'demo-hardening', title, description, priority, dueDate: due
    }));
    await H('demo-h01', 'Remove all randomness from chaincode', 'No Date.now, no random, no hashing with salts.', 'high', dayOffset(-2));
    await step('  assign', marco.call('PUT', '/tasks/demo-h01/assign', { assigneeId: E('anita') }));
    await H('demo-h02', 'Index keys for username and phone', 'LevelDB has no rich queries; write idx:* keys in the same transaction.', 'high', dayOffset(2));
    await step('  assign', marco.call('PUT', '/tasks/demo-h02/assign', { assigneeId: E('luca') }));
    await step('  luca starts', luca.call('PUT', '/tasks/demo-h02/status', { status: 'in-progress' }));
    await H('demo-h03', 'Document MVCC conflict handling', 'What the user sees when two transactions touch the same key.', 'medium', dayOffset(9));

    // ── Project 3: archived ───────────────────────────────────────────────────
    console.log('\nProject: Literature Review (archived)');
    await step('project', anita.call('POST', '/projects', {
        projectId: 'demo-literature', name: 'Literature Review',
        description: 'Survey of blockchain-based project management and traceability systems.'
    }));
    await step('Giulia as contributor', anita.call('POST', '/projects/demo-literature/members', { memberId: E('giulia'), role: 'contributor' }));
    await step('task', anita.call('POST', '/tasks', {
        taskId: 'demo-l01', projectId: 'demo-literature', title: 'Collect 20 papers',
        description: 'From IEEE, ACM and arXiv.', priority: 'medium', dueDate: dayOffset(-30)
    }));
    await step('  done', (async () => {
        const a = await anita.call('PUT', '/tasks/demo-l01/status', { status: 'in-progress' });
        if (a.status >= 300) return a;
        return anita.call('PUT', '/tasks/demo-l01/status', { status: 'done' });
    })());
    await step('archive project', anita.call('DELETE', '/projects/demo-literature'));

    // ── Project 4: empty ──────────────────────────────────────────────────────
    console.log('\nProject: Demo Day (empty board)');
    await step('project', anita.call('POST', '/projects', {
        projectId: 'demo-demoday', name: 'Demo Day',
        description: 'A fresh project with no tasks yet — shows the empty states.'
    }));

    console.log(`\nDone: ${created} created, ${skipped} already there.`);
    console.log('\nSign in at the web app as Anita:');
    console.log(`  username  ${PEOPLE.anita.username}   (or ${PEOPLE.anita.email})`);
    console.log(`  password  ${PASSWORD}`);
    console.log('Teammates use the same password: marco.rossi, giulia.bianchi, sara.conti, luca.ferrari');
    console.log('Project IDs: demo-thesis, demo-hardening, demo-literature, demo-demoday');
    console.log('Task IDs:    demo-t01 … demo-t11, demo-h01 … demo-h03, demo-l01');
}

main().catch(err => { console.error('\nSeed stopped:', err.message); process.exit(1); });
