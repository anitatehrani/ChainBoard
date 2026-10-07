import test from 'node:test'
import assert from 'node:assert/strict'
import {
  todayISO, daysUntil, dueLabel, cardState, filterTasks, groupByColumn, cardAriaLabel
} from './boardLogic.js'

const TODAY = '2026-10-07'

test('todayISO formats the local date with zero padding', () => {
  assert.equal(todayISO(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(todayISO(new Date(2026, 9, 7)), '2026-10-07')
})

test('daysUntil counts whole days and survives month/year ends', () => {
  assert.equal(daysUntil('2026-10-07', TODAY), 0)
  assert.equal(daysUntil('2026-10-10', TODAY), 3)
  assert.equal(daysUntil('2026-10-05', TODAY), -2)
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1)
  assert.equal(daysUntil('', TODAY), null)
  assert.equal(daysUntil('not-a-date', TODAY), null)
  assert.equal(daysUntil(undefined, TODAY), null)
})

test('dueLabel says it in words', () => {
  assert.equal(dueLabel('2026-10-06', TODAY), 'Overdue by 1 day')
  assert.equal(dueLabel('2026-10-01', TODAY), 'Overdue by 6 days')
  assert.equal(dueLabel('2026-10-07', TODAY), 'Due today')
  assert.equal(dueLabel('2026-10-08', TODAY), 'Due tomorrow')
  assert.equal(dueLabel('2026-10-12', TODAY), 'Due in 5 days')
  assert.equal(dueLabel('2026-11-30', TODAY), 'Due 2026-11-30')
  assert.equal(dueLabel('', TODAY), '')
})

test('cardState: overdue only for open, unarchived tasks', () => {
  const late = { status: 'todo', dueDate: '2026-10-01' }
  assert.equal(cardState(late, TODAY).state, 'overdue')
  assert.equal(cardState(late, TODAY).overdue, true)
  assert.equal(cardState({ ...late, status: 'in-progress' }, TODAY).state, 'overdue')
  assert.equal(cardState({ ...late, status: 'done' }, TODAY).state, 'done')
  assert.equal(cardState({ ...late, archived: true }, TODAY).state, 'archived')
  assert.equal(cardState({ ...late, status: 'done', archived: true }, TODAY).state, 'archived')
})

test('cardState: no due date or future date is simply open', () => {
  assert.equal(cardState({ status: 'todo' }, TODAY).state, 'open')
  assert.equal(cardState({ status: 'todo' }, TODAY).dueText, '')
  assert.equal(cardState({ status: 'todo', dueDate: '2026-10-07' }, TODAY).state, 'open')
  assert.equal(cardState({ status: 'todo', dueDate: '2026-10-07' }, TODAY).dueSoon, true)
  assert.equal(cardState({ status: 'todo', dueDate: '2026-10-09' }, TODAY).dueSoon, true)
  assert.equal(cardState({ status: 'todo', dueDate: '2026-10-10' }, TODAY).dueSoon, false)
})

test('filterTasks keeps the board\'s original behaviour', () => {
  const tasks = [
    { taskId: 'a', priority: 'high', assigneeId: 'x@y.z' },
    { taskId: 'b', priority: 'low', assigneeId: 'x@y.z', archived: true },
    { taskId: 'c', priority: 'high' }
  ]
  assert.deepEqual(filterTasks(tasks).map(t => t.taskId), ['a', 'c'])
  assert.deepEqual(filterTasks(tasks, { showArchived: true }).map(t => t.taskId), ['a', 'b', 'c'])
  assert.deepEqual(filterTasks(tasks, { priority: 'high' }).map(t => t.taskId), ['a', 'c'])
  assert.deepEqual(filterTasks(tasks, { assignee: 'x@y.z', showArchived: true }).map(t => t.taskId), ['a', 'b'])
})

test('groupByColumn ignores unknown statuses and keeps every column', () => {
  const g = groupByColumn(
    [{ taskId: 'a', status: 'todo' }, { taskId: 'b', status: 'done' }, { taskId: 'c', status: 'weird' }],
    ['todo', 'in-progress', 'done']
  )
  assert.deepEqual(Object.keys(g), ['todo', 'in-progress', 'done'])
  assert.equal(g.todo.length, 1)
  assert.equal(g['in-progress'].length, 0)
  assert.equal(g.done.length, 1)
})

test('cardAriaLabel reads as a sentence', () => {
  assert.equal(
    cardAriaLabel({ title: 'Write tests', priority: 'high', status: 'todo', dueDate: '2026-10-05' }, 'To Do', TODAY),
    'Write tests, high priority, To Do, Overdue by 2 days'
  )
  assert.equal(
    cardAriaLabel({ title: 'Old', priority: 'low', archived: true }, 'Done', TODAY),
    'Old, low priority, Done, archived'
  )
})
