import test from 'node:test'
import assert from 'node:assert/strict'
import {
  roleOf, canAddMember, canArchiveProject, canCreateTask, canWorkOnTask,
  canAssignTask, canArchiveTask, canComment, roleLabel
} from './permissionLogic.js'

const P = {
  status: 'active',
  members: [
    { id: 'o@x', role: 'owner' }, { id: 'a@x', role: 'admin' },
    { id: 'c@x', role: 'contributor' }, 'legacy@x'
  ]
}
const ARCH = { ...P, status: 'archived' }

test('roleOf: roles, legacy string members, outsiders', () => {
  assert.equal(roleOf(P, 'o@x'), 'owner')
  assert.equal(roleOf(P, 'legacy@x'), 'contributor')
  assert.equal(roleOf(P, 'z@x'), null)
  assert.equal(roleOf(null, 'o@x'), null)
})

test('canAddMember follows the chaincode', () => {
  assert.equal(canAddMember(P, 'o@x', 'admin').allowed, true)
  assert.equal(canAddMember(P, 'a@x', 'contributor').allowed, true)
  assert.equal(canAddMember(P, 'a@x', 'admin').allowed, false)
  assert.match(canAddMember(P, 'a@x', 'owner').reason, /only add contributors/)
  assert.equal(canAddMember(P, 'c@x').allowed, false)
  assert.equal(canAddMember(P, 'z@x').allowed, false)
  assert.match(canAddMember(ARCH, 'o@x').reason, /archived/)
})

test('canArchiveProject: owner only, not twice', () => {
  assert.equal(canArchiveProject(P, 'o@x').allowed, true)
  assert.equal(canArchiveProject(P, 'a@x').allowed, false)
  assert.match(canArchiveProject(ARCH, 'o@x').reason, /Already archived/)
})

test('canCreateTask: any member of an active project', () => {
  assert.equal(canCreateTask(P, 'c@x').allowed, true)
  assert.equal(canCreateTask(P, 'z@x').allowed, false)
  assert.equal(canCreateTask(ARCH, 'o@x').allowed, false)
})

test('canWorkOnTask: assignee, managers, or anyone when unassigned', () => {
  const open = { assigneeId: null }
  const mine = { assigneeId: 'c@x' }
  assert.equal(canWorkOnTask(P, open, 'legacy@x').allowed, true)
  assert.equal(canWorkOnTask(P, mine, 'c@x').allowed, true)
  assert.equal(canWorkOnTask(P, mine, 'a@x').allowed, true)
  assert.equal(canWorkOnTask(P, mine, 'o@x').allowed, true)
  assert.equal(canWorkOnTask(P, mine, 'legacy@x').allowed, false)
  assert.match(canWorkOnTask(P, mine, 'legacy@x').reason, /assigned to someone else/)
  assert.equal(canWorkOnTask(P, open, 'z@x').allowed, false)
})

test('canAssignTask: managers anyone; contributors only themselves and only if free', () => {
  assert.equal(canAssignTask(P, { assigneeId: 'c@x' }, 'o@x', 'legacy@x').allowed, true)
  assert.equal(canAssignTask(P, { assigneeId: null }, 'c@x', 'c@x').allowed, true)
  assert.equal(canAssignTask(P, { assigneeId: null }, 'c@x', 'legacy@x').allowed, false)
  assert.match(canAssignTask(P, { assigneeId: null }, 'c@x', 'legacy@x').reason, /only assign tasks to themselves/)
  assert.equal(canAssignTask(P, { assigneeId: 'legacy@x' }, 'c@x', 'c@x').allowed, false)
  assert.equal(canAssignTask(P, {}, 'z@x').allowed, false)
})

test('canArchiveTask and canComment', () => {
  assert.equal(canArchiveTask(P, 'a@x').allowed, true)
  assert.equal(canArchiveTask(P, 'c@x').allowed, false)
  assert.equal(canComment(P, 'c@x').allowed, true)
  assert.equal(canComment(P, 'z@x').allowed, false)
})

test('roleLabel', () => {
  assert.equal(roleLabel(P, 'a@x'), 'Your role: admin')
  assert.match(roleLabel(P, 'z@x'), /not a member/)
})
