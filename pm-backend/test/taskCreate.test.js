'use strict';

// A task needs an id, a project, a title and a priority. The description is optional.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp } = require('./helpers/harness');

let t, owner;
before(async () => {
    t = await startTestApp();
    owner = await t.signUp({ name: 'Tess Task', email: 'tess@example.com', username: 'tess.t' });
    await t.request('POST', '/api/projects', { cookie: owner.cookie, json: { projectId: 'tp', name: 'Tasks', description: 'x' } });
});
after(async () => { await t.close(); });

const create = json => t.request('POST', '/api/tasks', { cookie: owner.cookie, json });

test('a task can be created without a description', async () => {
    const r = await create({ taskId: 'no-desc', projectId: 'tp', title: 'Just a title', priority: 'low' });
    assert.equal(r.status, 201);
    assert.equal(r.body.description, '');
    assert.equal(r.body.title, 'Just a title');
});

test('title, priority, id and project are still required', async () => {
    assert.equal((await create({ taskId: 'a', projectId: 'tp', priority: 'low' })).status, 400);
    assert.equal((await create({ taskId: 'b', projectId: 'tp', title: 'T' })).status, 400);
    assert.equal((await create({ projectId: 'tp', title: 'T', priority: 'low' })).status, 400);
    assert.equal((await create({ taskId: 'c', title: 'T', priority: 'low' })).status, 400);
});
