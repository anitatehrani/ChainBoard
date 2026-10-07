import test from 'node:test'
import assert from 'node:assert/strict'
import { BASE_MS, MAX_MS, nextDelay, shouldRun, sameData, refreshTargets, mergeBoard } from './refreshLogic.js'

test('nextDelay backs off and is capped', () => {
  assert.equal(nextDelay(0), BASE_MS)
  assert.equal(nextDelay(1), BASE_MS * 2)
  assert.equal(nextDelay(2), BASE_MS * 4)
  assert.equal(nextDelay(50), MAX_MS)
  assert.equal(nextDelay(-3), BASE_MS)
  assert.equal(nextDelay(undefined), BASE_MS)
})

test('shouldRun needs enabled, visible, online and not busy', () => {
  assert.equal(shouldRun({ enabled: true, visible: true, online: true, busy: false }), true)
  assert.equal(shouldRun({ enabled: false, visible: true, online: true, busy: false }), false)
  assert.equal(shouldRun({ enabled: true, visible: false, online: true, busy: false }), false)
  assert.equal(shouldRun({ enabled: true, visible: true, online: false, busy: false }), false)
  assert.equal(shouldRun({ enabled: true, visible: true, online: true, busy: true }), false)
  assert.equal(shouldRun({ enabled: true, visible: true, busy: false }), true) // online unknown = assume yes
})

test('sameData', () => {
  assert.equal(sameData({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }), true)
  assert.equal(sameData({ a: 1 }, { a: 2 }), false)
  const loop = {}; loop.self = loop
  assert.equal(sameData(loop, loop), false) // unserialisable: treat as changed
})

test('refreshTargets per page', () => {
  const none = { hasProject: false, hasTask: false, editing: false }
  assert.deepEqual(refreshTargets('dashboard', none), ['projects'])
  assert.deepEqual(refreshTargets('profile', none), ['projects'])
  assert.deepEqual(refreshTargets('project', none), ['projects'])
  assert.deepEqual(refreshTargets('project', { ...none, hasProject: true }), ['project', 'projects'])
  assert.deepEqual(refreshTargets('board', none), [])
  assert.deepEqual(refreshTargets('board', { ...none, hasProject: true }), ['project', 'board'])
  assert.deepEqual(refreshTargets('task', { ...none, hasTask: true }), ['task'])
  assert.deepEqual(refreshTargets('task', { ...none, hasTask: true, editing: true }), [])
  assert.deepEqual(refreshTargets('settings', none), [])
  assert.deepEqual(refreshTargets('account', none), [])
})

test('mergeBoard keeps previous copy when a fetch failed and follows the id order', () => {
  const prev = [{ taskId: 'a', v: 1 }, { taskId: 'b', v: 1 }]
  const fresh = [{ taskId: 'a', v: 2 }, null]
  assert.deepEqual(mergeBoard(['a', 'b'], fresh, prev), [{ taskId: 'a', v: 2 }, { taskId: 'b', v: 1 }])
  assert.deepEqual(mergeBoard(['b', 'a'], fresh, prev).map(t => t.taskId), ['b', 'a'])
  assert.deepEqual(mergeBoard(['c'], [null], prev), [])
  assert.deepEqual(mergeBoard(undefined, undefined, undefined), [])
})
