'use strict';

// The existing project/task features, now behind the session: identity comes
// from the verified cookie, never from the request body.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/harness');

let t;
let a;
let b;
before(async () => {
    t = await startTestApp();
    a = await t.signUp({ name: 'Alice Anders', email: 'alice@example.com', username: 'alice.a' });
    b = await t.signUp({ name: 'Bruno Bell', email: 'bruno@example.com', username: 'bruno.b' });
});
after(async () => { await t.close(); });

const post = (url, cookie, json) => t.request('POST', url, { cookie, json });

describe('ownership and membership come from the session', () => {
    test('the owner is the signed-in user, whatever the body claims', async () => {
        const r = await post('/api/projects', a.cookie, {
            projectId: 'p1', name: 'Thesis', description: 'Blockchain PM', ownerId: 'someone.else@example.com'
        });
        assert.equal(r.status, 201);
        assert.equal(r.body.ownerId, 'alice@example.com');
        assert.deepEqual(r.body.members, [{ id: 'alice@example.com', role: 'owner' }]);
    });

    test('"my projects" lists only projects the person owns or belongs to', async () => {
        const mineA = await t.request('GET', '/api/projects/mine', { cookie: a.cookie });
        assert.deepEqual(mineA.body.map(p => p.projectId), ['p1']);
        const mineB = await t.request('GET', '/api/projects/mine', { cookie: b.cookie });
        assert.deepEqual(mineB.body, []);
    });

    test('adding a member puts the project in their list', async () => {
        const r = await post('/api/projects/p1/members', a.cookie, { memberId: 'bruno@example.com', role: 'contributor' });
        assert.equal(r.status, 200);
        const mineB = await t.request('GET', '/api/projects/mine', { cookie: b.cookie });
        assert.deepEqual(mineB.body.map(p => p.projectId), ['p1']);
    });

    test('adding the same member twice is a clear error', async () => {
        const r = await post('/api/projects/p1/members', a.cookie, { memberId: 'bruno@example.com', role: 'admin' });
        assert.equal(r.status, 400);
        assert.match(r.body.error, /already in project/);
    });

    test('/projects/mine is not mistaken for a project id', async () => {
        const r = await t.request('GET', '/api/projects/mine', { cookie: a.cookie });
        assert.equal(r.status, 200);
        assert.ok(Array.isArray(r.body));
        assert.equal((await t.request('GET', '/api/projects/does-not-exist', { cookie: a.cookie })).status, 404);
    });

    test('a comment is attributed to the signed-in user, never to a name in the body', async () => {
        await post('/api/tasks', a.cookie, { taskId: 't1', projectId: 'p1', title: 'Write', description: 'Chapter 1', priority: 'high' });
        const r = await post('/api/tasks/t1/comments', b.cookie, { authorId: 'alice@example.com', text: 'Looks good' });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.comments, [{ authorId: 'bruno@example.com', text: 'Looks good' }]);
    });

    test('nothing is written when the request has no session', async () => {
        const r = await t.request('POST', '/api/projects', { json: { projectId: 'ghost', name: 'x', description: 'y' } });
        assert.equal(r.status, 401);
        assert.equal(t.ledger.peek('project:ghost'), null);
    });
});

describe('the directory used by the name pickers', () => {
    test('lists everyone as {email, name, username} and nothing else', async () => {
        const r = await t.request('GET', '/api/users', { cookie: a.cookie });
        assert.equal(r.status, 200);
        const emails = r.body.map(u => u.email);
        assert.ok(emails.includes('alice@example.com') && emails.includes('bruno@example.com'));
        for (const u of r.body) assert.deepEqual(Object.keys(u).sort(), ['email', 'name', 'username']);
        assert.ok(!JSON.stringify(r.body).includes('scrypt'));
    });
});

describe('tasks and archiving still behave', () => {
    test('invalid status transitions are rejected with the ledger\'s reason', async () => {
        const r = await t.request('PUT', '/api/tasks/t1/status', { cookie: a.cookie, json: { status: 'done' } });
        assert.equal(r.status, 400);
        assert.match(r.body.error, /Invalid transition/);
        const ok = await t.request('PUT', '/api/tasks/t1/status', { cookie: a.cookie, json: { status: 'in-progress' } });
        assert.equal(ok.status, 200);
    });

    test('a task can only be assigned to a project member', async () => {
        const bad = await t.request('PUT', '/api/tasks/t1/assign', { cookie: a.cookie, json: { assigneeId: 'nobody@example.com' } });
        assert.equal(bad.status, 400);
        assert.match(bad.body.error, /not a member/);
        const ok = await t.request('PUT', '/api/tasks/t1/assign', { cookie: a.cookie, json: { assigneeId: 'bruno@example.com' } });
        assert.equal(ok.body.assigneeId, 'bruno@example.com');
    });

    test('missing tasks are a 404, missing fields a 400', async () => {
        assert.equal((await t.request('GET', '/api/tasks/nope', { cookie: a.cookie })).status, 404);
        assert.equal((await post('/api/tasks', a.cookie, { taskId: 'x' })).status, 400);
    });

    test('the task history is the on-chain audit trail', async () => {
        const r = await t.request('GET', '/api/tasks/t1/history', { cookie: a.cookie });
        assert.equal(r.status, 200);
        assert.ok(r.body.length >= 3);
    });

    test('archiving a project twice is refused', async () => {
        assert.equal((await t.request('DELETE', '/api/projects/p1', { cookie: a.cookie })).body.status, 'archived');
        const again = await t.request('DELETE', '/api/projects/p1', { cookie: a.cookie });
        assert.equal(again.status, 400);
        assert.match(again.body.error, /already archived/);
    });
});
