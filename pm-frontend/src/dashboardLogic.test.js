import test from 'node:test'
import assert from 'node:assert/strict'
import { memberCountLabel, projectState, taskSummary, summaryText } from './dashboardLogic.js'

const TODAY = '2026-10-07'
const COLS = ['todo', 'in-progress', 'done']

test('memberCountLabel pluralises and tolerates bad input', () => {
  assert.equal(memberCountLabel([1]), '1 member')
  assert.equal(memberCountLabel([1, 2]), '2 members')
  assert.equal(memberCountLabel([]), '0 members')
  assert.equal(memberCountLabel(undefined), '0 members')
})

test('projectState', () => {
  assert.equal(projectState({ status: 'archived' }), 'archived')
  assert.equal(projectState({ status: 'active' }), 'active')
  assert.equal(projectState(null), 'active')
})

test('taskSummary counts per column, skips archived, flags overdue', () => {
  const tasks = [
    { status: 'todo', dueDate: '2026-10-01' },
    { status: 'todo' },
    { status: 'in-progress' },
    { status: 'done', dueDate: '2026-09-01' },
    { status: 'todo', archived: true, dueDate: '2026-09-01' }
  ]
  const s = taskSummary(tasks, COLS, TODAY)
  assert.deepEqual(s.counts, { todo: 2, 'in-progress': 1, done: 1 })
  assert.equal(s.total, 4)
  assert.equal(s.overdue, 1)
  assert.equal(s.percentDone, 25)
})

test('taskSummary on empty or missing input', () => {
  const s = taskSummary(undefined, COLS, TODAY)
  assert.equal(s.total, 0)
  assert.equal(s.percentDone, 0)
  assert.deepEqual(s.counts, { todo: 0, 'in-progress': 0, done: 0 })
})

test('summaryText', () => {
  assert.equal(summaryText({ total: 0 }), 'No tasks yet')
  assert.equal(summaryText({ total: 4, percentDone: 25, overdue: 0 }), '25% done · 4 tasks')
  assert.equal(summaryText({ total: 1, percentDone: 0, overdue: 1 }), '0% done · 1 task · 1 overdue')
})
