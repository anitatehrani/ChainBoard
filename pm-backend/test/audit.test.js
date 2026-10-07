'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonical, chain, buildReport, verifyReport, GENESIS, ALGORITHM } = require('../lib/audit');
const { startTestApp } = require('./helpers/harness');

describe('digest chain', () => {
    const history = [
        { txId: 'tx1', value: { status: 'todo', n: 1 } },
        { txId: 'tx2', value: { status: 'in-progress', n: 1 } },
        { txId: 'tx3', value: { status: 'done', n: 1 } }
    ];

    test('canonical JSON ignores key order and is stable', () => {
        assert.equal(canonical({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } }), '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
        assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
        assert.equal(canonical(undefined), 'null');
    });

    test('is deterministic and each digest depends on the one before it', () => {
        const a = chain(history);
        const b = chain(history);
        assert.deepEqual(a.map(r => r.digest), b.map(r => r.digest));
        assert.equal(new Set(a.map(r => r.digest)).size, 3);
        assert.match(a[0].digest, /^[0-9a-f]{64}$/);
        assert.deepEqual(a.map(r => r.n), [1, 2, 3]);
    });

    test('changing, removing or re-ordering any record changes the head digest', () => {
        const head = (h) => { const c = chain(h); return c[c.length - 1].digest; };
        const base = head(history);
        const edited = history.map((h, i) => (i === 0 ? { ...h, value: { ...h.value, n: 2 } } : h));
        assert.notEqual(head(edited), base);
        assert.notEqual(head(history.slice(1)), base);
        assert.notEqual(head([history[1], history[0], history[2]]), base);
        assert.notEqual(head([...history, { txId: 'tx4', value: {} }]), base);
        assert.notEqual(head(history.map((h, i) => (i === 1 ? { ...h, txId: 'txX' } : h))), base);
    });

    test('an empty history has the genesis head', () => {
        const r = buildReport({ kind: 'task', id: 't', history: [] });
        assert.equal(r.headDigest, GENESIS);
        assert.equal(r.recordCount, 0);
        assert.equal(r.allOnLedger, false);
    });
});

describe('report', () => {
    const history = [{ txId: 'a', value: { x: 1 } }, { txId: 'b', value: { x: 2 } }];

    test('summarises ledger checks', () => {
        const all = buildReport({ kind: 'task', id: 't', history, txChecks: { a: true, b: true } });
        assert.equal(all.allOnLedger, true);
        assert.equal(all.anyMissing, false);
        assert.equal(all.algorithm, ALGORITHM);
        const missing = buildReport({ kind: 'task', id: 't', history, txChecks: { a: true, b: false } });
        assert.equal(missing.allOnLedger, false);
        assert.equal(missing.anyMissing, true);
        const unknown = buildReport({ kind: 'task', id: 't', history, txChecks: { a: true, b: null } });
        assert.equal(unknown.allOnLedger, false);
        assert.equal(unknown.anyMissing, false);
        assert.equal(unknown.ledgerChecked, 1);
    });

    test('verifyReport accepts an untouched report and pinpoints tampering', () => {
        const good = buildReport({ kind: 'task', id: 't', history, txChecks: { a: true, b: true } });
        assert.deepEqual(verifyReport(JSON.parse(JSON.stringify(good))).problems, []);

        const forged = JSON.parse(JSON.stringify(good));
        forged.records[0].value.x = 999;
        const r = verifyReport(forged);
        assert.equal(r.ok, false);
        assert.match(r.problems[0], /Record 1/);

        const dropped = JSON.parse(JSON.stringify(good));
        dropped.records.shift();
        assert.equal(verifyReport(dropped).ok, false);

        const badHead = JSON.parse(JSON.stringify(good));
        badHead.headDigest = 'f'.repeat(64);
        assert.match(verifyReport(badHead).problems.join(' '), /head digest/);

        assert.equal(verifyReport({ foo: 1 }).ok, false);
        assert.equal(verifyReport(null).ok, false);
    });
});

describe('audit endpoints', () => {
    let t, owner;
    before(async () => {
        t = await startTestApp();
        owner = await t.signUp({ name: 'Audra Audit', email: 'audra@example.com', username: 'audra.a' });
        await t.request('POST', '/api/projects', { cookie: owner.cookie, json: { projectId: 'pa', name: 'A', description: 'd' } });
        await t.request('POST', '/api/tasks', { cookie: owner.cookie, json: { taskId: 'ta', projectId: 'pa', title: 'T', description: 'd', priority: 'low' } });
        await t.request('PUT', '/api/tasks/ta/status', { cookie: owner.cookie, json: { status: 'in-progress' } });
    });
    after(async () => { await t.close(); });

    test('a task report lists every record, checks each transaction, and verifies', async () => {
        const r = await t.request('GET', '/api/tasks/ta/audit', { cookie: owner.cookie });
        assert.equal(r.status, 200);
        assert.equal(r.body.kind, 'task');
        assert.equal(r.body.recordCount, 2);
        assert.equal(r.body.allOnLedger, true);
        assert.equal(verifyReport(r.body).ok, true);
        assert.deepEqual(r.body.records.map(x => x.value.status), ['todo', 'in-progress']);
    });

    test('a project report works the same way', async () => {
        const r = await t.request('GET', '/api/projects/pa/audit', { cookie: owner.cookie });
        assert.equal(r.status, 200);
        assert.equal(r.body.kind, 'project');
        assert.equal(r.body.recordCount, 1);
        assert.equal(verifyReport(r.body).ok, true);
    });

    test('a transaction the peer does not know is flagged', async () => {
        const hist = await t.request('GET', '/api/tasks/ta/history', { cookie: owner.cookie });
        t.ledger.hiddenTxs = new Set([hist.body[1].txId]);
        const r = await t.request('GET', '/api/tasks/ta/audit', { cookie: owner.cookie });
        assert.equal(r.body.anyMissing, true);
        assert.equal(r.body.allOnLedger, false);
        assert.equal(r.body.records[1].onLedger, false);
        t.ledger.hiddenTxs = null;
    });

    test('?download=1 adds a file name header; the report needs a session; unknown ids are 404', async () => {
        const d = await t.request('GET', '/api/tasks/ta/audit?download=1', { cookie: owner.cookie });
        assert.match(d.headers['content-disposition'], /attachment; filename="audit-task-ta\.json"/);
        assert.equal((await t.request('GET', '/api/tasks/ta/audit')).status, 401);
        assert.equal((await t.request('GET', '/api/tasks/nope/audit', { cookie: owner.cookie })).status, 404);
    });

    test('scripts/verify-audit.js accepts a downloaded file and rejects an edited one', async () => {
        const r = await t.request('GET', '/api/tasks/ta/audit', { cookie: owner.cookie });
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
        const file = path.join(dir, 'report.json');
        const script = path.join(__dirname, '..', 'scripts', 'verify-audit.js');

        fs.writeFileSync(file, JSON.stringify(r.body));
        const ok = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
        assert.equal(ok.status, 0, ok.stdout + ok.stderr);
        assert.match(ok.stdout, /OK: every digest matches/);

        const forged = JSON.parse(JSON.stringify(r.body));
        forged.records[1].value.status = 'done';
        fs.writeFileSync(file, JSON.stringify(forged));
        const bad = spawnSync(process.execPath, [script, file], { encoding: 'utf8' });
        assert.equal(bad.status, 1);
        assert.match(bad.stdout, /FAILED/);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
