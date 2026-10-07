'use strict';

// Who may do what inside a project is decided by the CHAINCODE (the ledger), not
// only by the backend. The backend passes the signed-in person as the actor.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/harness');

let t;
let owner, admin, c1, c2, outsider;
before(async () => {
    t = await startTestApp();
    owner = await t.signUp({ name: 'Olga Owner', email: 'olga@example.com', username: 'olga.o' });
    admin = await t.signUp({ name: 'Adam Admin', email: 'adam@example.com', username: 'adam.a' });
    c1 = await t.signUp({ name: 'Cora Contrib', email: 'cora@example.com', username: 'cora.c' });
    c2 = await t.signUp({ name: 'Carl Contrib', email: 'carl@example.com', username: 'carl.c' });
    outsider = await t.signUp({ name: 'Otto Outside', email: 'otto@example.com', username: 'otto.o' });

    await t.request('POST', '/api/projects', { cookie: owner.cookie, json: { projectId: 'p1', name: 'Perm', description: 'permissions' } });
    await t.request('POST', '/api/projects/p1/members', { cookie: owner.cookie, json: { memberId: 'adam@example.com', role: 'admin' } });
    await t.request('POST', '/api/projects/p1/members', { cookie: owner.cookie, json: { memberId: 'cora@example.com', role: 'contributor' } });
    await t.request('POST', '/api/projects/p1/members', { cookie: owner.cookie, json: { memberId: 'carl@example.com', role: 'contributor' } });
});
after(async () => { await t.close(); });

const req = (method, url, who, json) => t.request(method, url, { cookie: who.cookie, json });
const task = (id, who = owner) => req('POST', '/api/tasks', who, {
    taskId: id, projectId: 'p1', title: `Task ${id}`, description: 'd', priority: 'medium'
});

describe('people outside the project', () => {
    test('cannot create tasks, comment, change anything or add members (403)', async () => {
        await task('t-out');
        const create = await task('t-out-2', outsider);
        assert.equal(create.status, 403);
        assert.match(create.body.error, /only project members/);
        assert.equal((await req('POST', '/api/tasks/t-out/comments', outsider, { text: 'hi' })).status, 403);
        assert.equal((await req('PUT', '/api/tasks/t-out/status', outsider, { status: 'in-progress' })).status, 403);
        assert.equal((await req('PUT', '/api/tasks/t-out/meta', outsider, { field: 'title', value: 'x' })).status, 403);
        assert.equal((await req('POST', '/api/tasks/t-out/files', outsider, { fileName: 'a', ipfsCid: 'Qm1' })).status, 403);
        assert.equal((await req('PUT', '/api/tasks/t-out/assign', outsider, { assigneeId: 'otto@example.com' })).status, 403);
        assert.equal((await req('POST', '/api/projects/p1/members', outsider, { memberId: 'otto@example.com', role: 'contributor' })).status, 403);
        assert.equal(t.ledger.peek('task:t-out-2'), null, 'nothing was written');
    });
});

describe('adding members', () => {
    test('a contributor cannot add members', async () => {
        const r = await req('POST', '/api/projects/p1/members', c1, { memberId: 'otto@example.com', role: 'contributor' });
        assert.equal(r.status, 403);
        assert.match(r.body.error, /only project owners and admins/);
    });

    test('the body can never name a different actor', async () => {
        const r = await req('POST', '/api/projects/p1/members', c1, {
            memberId: 'otto@example.com', role: 'contributor', actorId: 'olga@example.com'
        });
        assert.equal(r.status, 403);
    });

    test('an admin may add contributors but not admins or owners', async () => {
        const bad = await req('POST', '/api/projects/p1/members', admin, { memberId: 'otto@example.com', role: 'admin' });
        assert.equal(bad.status, 403);
        assert.match(bad.body.error, /admins can only add contributors/);
        const bad2 = await req('POST', '/api/projects/p1/members', admin, { memberId: 'otto@example.com', role: 'owner' });
        assert.equal(bad2.status, 403);
        const ok = await req('POST', '/api/projects/p1/members', admin, { memberId: 'otto@example.com', role: 'contributor' });
        assert.equal(ok.status, 200);
        // otto is now a member (used by the tests below only as a contributor)
    });

    test('the owner may grant any role', async () => {
        const extra = await t.signUp({ name: 'Eva Extra', email: 'eva@example.com', username: 'eva.e' });
        const r = await req('POST', '/api/projects/p1/members', owner, { memberId: extra.user.email, role: 'admin' });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.members.find(m => m.id === 'eva@example.com'), { id: 'eva@example.com', role: 'admin' });
    });
});

describe('working on tasks', () => {
    test('any member can create a task, and an unassigned task is open to every member', async () => {
        assert.equal((await task('t-open', c1)).status, 201);
        assert.equal((await req('PUT', '/api/tasks/t-open/status', c2, { status: 'in-progress' })).status, 200);
        assert.equal((await req('PUT', '/api/tasks/t-open/status', c2, { status: 'todo' })).status, 200);
    });

    test('a contributor can take an unassigned task, but cannot assign someone else', async () => {
        await task('t-take');
        const other = await req('PUT', '/api/tasks/t-take/assign', c1, { assigneeId: 'carl@example.com' });
        assert.equal(other.status, 403);
        assert.match(other.body.error, /only assign tasks to themselves/);
        const self = await req('PUT', '/api/tasks/t-take/assign', c1, { assigneeId: 'cora@example.com' });
        assert.equal(self.status, 200);
        assert.equal(self.body.assigneeId, 'cora@example.com');
    });

    test('an assigned task belongs to its assignee, admins and the owner', async () => {
        await task('t-mine');
        await req('PUT', '/api/tasks/t-mine/assign', owner, { assigneeId: 'cora@example.com' });

        for (const [call, expect] of [
            [() => req('PUT', '/api/tasks/t-mine/status', c2, { status: 'in-progress' }), 403],
            [() => req('PUT', '/api/tasks/t-mine/meta', c2, { field: 'title', value: 'x' }), 403],
            [() => req('POST', '/api/tasks/t-mine/files', c2, { fileName: 'a', ipfsCid: 'QmA' }), 403],
            [() => req('PUT', '/api/tasks/t-mine/assign', c2, { assigneeId: 'carl@example.com' }), 403]
        ]) {
            const r = await call();
            assert.equal(r.status, expect);
            assert.match(r.body.error, /Permission denied/);
        }
        assert.equal((await req('PUT', '/api/tasks/t-mine/status', c1, { status: 'in-progress' })).status, 200);
        assert.equal((await req('PUT', '/api/tasks/t-mine/meta', admin, { field: 'priority', value: 'high' })).status, 200);
        assert.equal((await req('POST', '/api/tasks/t-mine/files', owner, { fileName: 'a', ipfsCid: 'QmB' })).status, 200);
    });

    test('everyone in the project can still comment, even on someone else\'s task', async () => {
        const r = await req('POST', '/api/tasks/t-mine/comments', c2, { text: 'Can I help?' });
        assert.equal(r.status, 200);
        assert.equal(r.body.comments.at(-1).authorId, 'carl@example.com');
    });

    test('a task assigned to someone else cannot be taken over by a contributor', async () => {
        const r = await req('PUT', '/api/tasks/t-mine/assign', c2, { assigneeId: 'carl@example.com' });
        assert.equal(r.status, 403);
    });
});

describe('archiving', () => {
    test('only owners and admins can archive a task', async () => {
        await task('t-arch');
        const no = await req('DELETE', '/api/tasks/t-arch', c1);
        assert.equal(no.status, 403);
        assert.match(no.body.error, /only project owners and admins/);
        assert.equal((await req('DELETE', '/api/tasks/t-arch', admin)).body.archived, true);
    });

    test('only the owner can archive the project; afterwards it is read-only', async () => {
        const byAdmin = await req('DELETE', '/api/projects/p1', admin);
        assert.equal(byAdmin.status, 403);
        assert.match(byAdmin.body.error, /only the project owner/);
        assert.equal((await req('DELETE', '/api/projects/p1', owner)).body.status, 'archived');

        const add = await req('POST', '/api/projects/p1/members', owner, { memberId: 'otto@example.com', role: 'admin' });
        assert.equal(add.status, 400);
        assert.match(add.body.error, /archived/);
        assert.equal((await task('t-late')).status, 400);
    });
});

describe('the contract itself', () => {
    test('a call without an actor is refused, whatever the backend does', async () => {
        await assert.rejects(() => t.ledger.submit('archiveProject', 'p1'), /Expected: projectId, actorId/);
        await assert.rejects(() => t.ledger.submit('archiveProject', 'p1', '  '), /Missing actor/);
        await assert.rejects(() => t.ledger.submit('updateTaskStatus', 't-open', 'done'), /Expected: taskId, newStatus, actorId/);
    });

    test('old projects with plain-string members are treated as contributors', async () => {
        t.ledger.world.set('project:legacy', Buffer.from(JSON.stringify({
            docType: 'project', projectId: 'legacy', name: 'Old', description: 'd', ownerId: 'old@x.io',
            members: ['old@x.io', 'older@x.io'], status: 'active'
        })));
        await t.ledger.submit('createTask', 'legacy-t', 'legacy', 'T', 'd', 'low', '', 'older@x.io');
        await assert.rejects(
            () => t.ledger.submit('addProjectMember', 'legacy', 'new@x.io', 'contributor', 'older@x.io'),
            /only project owners and admins/
        );
    });
});

describe('tasks of a project come from the ledger', () => {
    let q;
    before(async () => {
        q = await t.signUp({ name: 'Quinn Query', email: 'quinn@example.com', username: 'quinn.q' });
        await req('POST', '/api/projects', q, { projectId: 'pq', name: 'Query', description: 'd' });
        await req('POST', '/api/projects', q, { projectId: 'pq2', name: 'Other', description: 'd' });
        for (const id of ['b-task', 'a-task', 'c-task']) {
            await req('POST', '/api/tasks', q, { taskId: id, projectId: 'pq', title: id, description: 'd', priority: 'low' });
        }
        await req('POST', '/api/tasks', q, { taskId: 'z-other', projectId: 'pq2', title: 'z', description: 'd', priority: 'low' });
        await req('DELETE', '/api/tasks/c-task', q);
    });

    test('lists only that project\'s tasks (archived ones included), in a stable order', async () => {
        const r = await t.request('GET', '/api/projects/pq/tasks', { cookie: q.cookie });
        assert.equal(r.status, 200);
        assert.deepEqual(r.body.map(x => x.taskId), ['a-task', 'b-task', 'c-task']);
        assert.equal(r.body.find(x => x.taskId === 'c-task').archived, true);
    });

    test('an empty project gives an empty list; an unknown project is a 404', async () => {
        await req('POST', '/api/projects', q, { projectId: 'pe', name: 'Empty', description: 'd' });
        assert.deepEqual((await t.request('GET', '/api/projects/pe/tasks', { cookie: q.cookie })).body, []);
        assert.equal((await t.request('GET', '/api/projects/nope/tasks', { cookie: q.cookie })).status, 404);
    });

    test('needs a session', async () => {
        assert.equal((await t.request('GET', '/api/projects/pq/tasks')).status, 401);
    });
});
