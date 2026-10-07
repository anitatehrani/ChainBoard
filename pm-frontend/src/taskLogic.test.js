import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedMove, describeChange, auditEntries } from './taskLogic.js'

test('isAllowedMove keeps the viewer\'s original rules', () => {
  assert.equal(isAllowedMove('todo', 'todo'), true)
  assert.equal(isAllowedMove('todo', 'in-progress'), true)
  assert.equal(isAllowedMove('todo', 'done'), false)
  assert.equal(isAllowedMove('in-progress', 'todo'), true)
  assert.equal(isAllowedMove('in-progress', 'done'), true)
  assert.equal(isAllowedMove('done', 'in-progress'), true)
  assert.equal(isAllowedMove('done', 'todo'), true)
  assert.equal(isAllowedMove('weird', 'todo'), false)
})

test('describeChange: first record is creation', () => {
  assert.deepEqual(describeChange(null, { status: 'todo' }), ['Task created'])
})

test('describeChange names each change in words', () => {
  const label = s => ({ todo: 'To Do', 'in-progress': 'In Progress' }[s] || s)
  const a = { status: 'todo', priority: 'low', title: 'T', description: 'd' }
  assert.deepEqual(describeChange(a, { ...a, status: 'in-progress' }, label), ['Status To Do → In Progress'])
  assert.deepEqual(describeChange(a, { ...a, assigneeId: 'x@y.z' }), ['Assignee changed'])
  assert.deepEqual(describeChange({ ...a, assigneeId: 'x@y.z' }, a), ['Assignee removed'])
  assert.deepEqual(describeChange(a, { ...a, priority: 'high' }), ['Priority low → high'])
  assert.deepEqual(describeChange(a, { ...a, dueDate: '2026-11-01' }), ['Due date set to 2026-11-01'])
  assert.deepEqual(describeChange(a, { ...a, comments: [{}] }), ['Comment added'])
  assert.deepEqual(describeChange(a, { ...a, attachments: [{}] }), ['File attached'])
  assert.deepEqual(describeChange(a, { ...a, archived: true }), ['Archived'])
  assert.deepEqual(describeChange(a, { ...a }), ['Updated'])
})

test('auditEntries is newest first and numbers records oldest = 1', () => {
  const h = [
    { txId: 'a', value: { status: 'todo', priority: 'low' } },
    { txId: 'b', value: { status: 'in-progress', priority: 'low' } }
  ]
  const e = auditEntries(h)
  assert.equal(e.length, 2)
  assert.equal(e[0].n, 2)
  assert.equal(e[0].txId, 'b')
  assert.deepEqual(e[0].changes, ['Status todo → in-progress'])
  assert.deepEqual(e[1].changes, ['Task created'])
  assert.deepEqual(auditEntries(null), [])
})
