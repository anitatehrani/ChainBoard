import test from 'node:test'
import assert from 'node:assert/strict'
import {
  memberCountLabel, projectState, taskSummary, summaryText,
  greeting, roleIn, projectCounts, filterProjects, searchIsActive
} from './dashboardLogic.js'

const P = (projectId, name, status, members, description = '') => ({ projectId, name, status, members, description })
const projects = [
  P('b-1', 'Beta Release', 'active', [{ id: 'me@x.it', role: 'admin' }]),
  P('a-1', 'alpha thesis', 'archived', [{ id: 'me@x.it', role: 'owner' }], 'Literature review'),
  P('c-1', 'Cedar', 'active', [{ id: 'me@x.it', role: 'owner' }, 'old@x.it'], 'Fabric chaincode work'),
  P('d-1', 'Delta', 'active', ['me@x.it'])
]

test('greeting follows the local hour', () => {
  assert.equal(greeting(new Date(2026, 9, 7, 8)), 'Good morning')
  assert.equal(greeting(new Date(2026, 9, 7, 13)), 'Good afternoon')
  assert.equal(greeting(new Date(2026, 9, 7, 19)), 'Good evening')
  assert.equal(greeting(new Date(2026, 9, 7, 2)), 'Good evening')
})

test('roleIn reads {id, role} members, plain strings (contributor) and non-members', () => {
  assert.equal(roleIn(projects[0], 'me@x.it'), 'admin')
  assert.equal(roleIn(projects[2], 'old@x.it'), 'contributor')
  assert.equal(roleIn(projects[3], 'me@x.it'), 'contributor')
  assert.equal(roleIn(projects[0], 'nobody@x.it'), null)
  assert.equal(roleIn(null, 'me@x.it'), null)
})

test('projectCounts', () => {
  assert.deepEqual(projectCounts(projects, 'me@x.it'), { total: 4, active: 3, archived: 1, owned: 2 })
  assert.deepEqual(projectCounts(undefined, 'me@x.it'), { total: 0, active: 0, archived: 0, owned: 0 })
})

test('filterProjects sorts active first then by name, without mutating the input', () => {
  const before = projects.map(p => p.projectId)
  assert.deepEqual(filterProjects(projects).map(p => p.projectId), ['b-1', 'c-1', 'd-1', 'a-1'])
  assert.deepEqual(projects.map(p => p.projectId), before)
})

test('search only starts at 3 characters; shorter text lists everything', () => {
  assert.equal(searchIsActive('ab'), false)
  assert.equal(searchIsActive('  ab '), false)
  assert.equal(searchIsActive('abc'), true)
  assert.equal(filterProjects(projects, { query: 'x' }).length, 4)
  assert.equal(filterProjects(projects, { query: 'de' }).length, 4)
  assert.deepEqual(filterProjects(projects, { query: 'del' }).map(p => p.projectId), ['d-1'])
})

test('filterProjects by status and by search (name, description, id; every word must match)', () => {
  assert.deepEqual(filterProjects(projects, { status: 'archived' }).map(p => p.projectId), ['a-1'])
  assert.deepEqual(filterProjects(projects, { query: 'FABRIC' }).map(p => p.projectId), ['c-1'])
  assert.deepEqual(filterProjects(projects, { query: 'alpha review' }).map(p => p.projectId), ['a-1'])
  assert.deepEqual(filterProjects(projects, { query: 'd-1' }).map(p => p.projectId), ['d-1'])
  assert.deepEqual(filterProjects(projects, { query: 'zzz' }), [])
  assert.deepEqual(filterProjects(projects, { status: 'active', query: 'thesis' }), [])
})

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
