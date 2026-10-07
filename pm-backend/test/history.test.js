'use strict';

// Every record of the audit trail says WHEN (block time) and WHO (the actor the
// chaincode saw), so the timeline can show them.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/harness');

let t, owner, member;
before(async () => {
    t = await startTestApp();
    owner = await t.signUp({ name: 'Olga Owner', email: 'olga@example.com', username: 'olga.o' });
    member = await t.signUp({ name: 'Mia Member', email: 'mia@example.com', username: 'mia.m' });
    await t.request('POST', '/api/projects', { cookie: owner.cookie, json: { projectId: 'hp', name: 'Hist', description: 'h' } });
    await t.request('POST', '/api/projects/hp/members', { cookie: owner.cookie, json: { memberId: 'mia@example.com', role: 'contributor' } });
    await t.request('POST', '/api/tasks', { cookie: owner.cookie, json: { taskId: 'ht', projectId: 'hp', title: 'T', description: 'd', priority: 'low' } });
    await t.request('POST', '/api/tasks/ht/comments', { cookie: member.cookie, json: { text: 'hello' } });
});
after(async () => { await t.close(); });

test('task history carries a block time and the actor of each change', async () => {
    const r = await t.request('GET', '/api/tasks/ht/audit', { cookie: owner.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.body.records.length, 2);
    for (const rec of r.body.records) {
        assert.match(rec.timestamp, /^\d{4}-\d{2}-\d{2}T/, 'ISO timestamp from the transaction');
    }
    assert.equal(r.body.records[0].value.updatedBy, 'olga@example.com');
    assert.equal(r.body.records[1].value.updatedBy, 'mia@example.com');
});

test('project history carries a block time and the actor too', async () => {
    const r = await t.request('GET', '/api/projects/hp/audit', { cookie: owner.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.body.records.length, 2);
    assert.equal(r.body.records[0].value.updatedBy, 'olga@example.com');
    assert.match(r.body.records[1].timestamp, /^\d{4}-/);
});

test('the digest chain still verifies with the extra fields', async () => {
    const { verifyReport } = require('../lib/audit');
    const r = await t.request('GET', '/api/tasks/ht/audit', { cookie: owner.cookie });
    assert.equal(verifyReport(r.body).ok, true);
});
