import test from 'node:test'
import assert from 'node:assert/strict'
import { navTabs, tabAriaLabel, firstName } from './navLogic.js'

test('navTabs: dashboard always on; project/board need a project; task needs a task', () => {
  const none = navTabs({ hasProject: false, hasTask: false })
  assert.deepEqual(none.map(t => t.id), ['dashboard', 'project', 'board', 'task'])
  assert.deepEqual(none.map(t => t.enabled), [true, false, false, false])
  const proj = navTabs({ hasProject: true, hasTask: false })
  assert.deepEqual(proj.map(t => t.enabled), [true, true, true, false])
  const all = navTabs({ hasProject: true, hasTask: true })
  assert.ok(all.every(t => t.enabled))
  assert.ok(all.every(t => t.reason === ''))
})

test('tabAriaLabel says why a tab is unavailable', () => {
  const [, project, , task] = navTabs({ hasProject: false, hasTask: false })
  assert.equal(tabAriaLabel(project), 'Project (unavailable: Open a project first)')
  assert.equal(tabAriaLabel(task), 'Task (unavailable: Open a task first)')
  assert.equal(tabAriaLabel(navTabs({ hasProject: true, hasTask: true })[1]), 'Project')
})

test('firstName', () => {
  assert.equal(firstName('Anita Tehrani'), 'Anita')
  assert.equal(firstName('  Marco '), 'Marco')
  assert.equal(firstName(''), '')
  assert.equal(firstName(undefined), '')
})
