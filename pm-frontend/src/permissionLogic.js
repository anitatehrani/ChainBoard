// What the signed-in person may do, as plain functions (no React, no DOM, no network).
// This MIRRORS the rules enforced by the chaincode (pm-chaincode/index.js) so the UI can
// disable buttons and say why. It is only a convenience: the ledger is the authority and
// refuses anything not allowed, whatever the UI shows.

import { memberId, memberRole } from './projectLogic.js'

export function roleOf(project, email) {
  const found = ((project && project.members) || []).find(m => memberId(m) === email)
  if (!found) return null
  return memberRole(found) || 'contributor' // old string-only members count as contributors
}

const isManager = (role) => role === 'owner' || role === 'admin'

// { allowed: boolean, reason: string }  (reason is '' when allowed)
const yes = () => ({ allowed: true, reason: '' })
const no = (reason) => ({ allowed: false, reason })

export function canAddMember(project, email, roleToGrant = 'contributor') {
  const role = roleOf(project, email)
  if (project && project.status === 'archived') return no('This project is archived and read-only.')
  if (!isManager(role)) return no('Only the owner or an admin can add members.')
  if (role === 'admin' && roleToGrant !== 'contributor') return no('Admins can only add contributors. Ask the owner for a higher role.')
  return yes()
}

export function canArchiveProject(project, email) {
  if (project && project.status === 'archived') return no('Already archived.')
  return roleOf(project, email) === 'owner' ? yes() : no('Only the project owner can archive the project.')
}

export function canCreateTask(project, email) {
  if (project && project.status === 'archived') return no('This project is archived and read-only.')
  return roleOf(project, email) ? yes() : no('Only project members can create tasks.')
}

// May this person change this task (status, details, files)?
export function canWorkOnTask(project, task, email) {
  const role = roleOf(project, email)
  if (!role) return no('Only project members can change tasks.')
  if (isManager(role) || !task.assigneeId || task.assigneeId === email) return yes()
  return no('This task is assigned to someone else. Only the assignee, an admin or the owner can change it.')
}

// May this person assign the task to `assigneeId`? (assigneeId may be '' to ask "can I assign at all")
export function canAssignTask(project, task, email, assigneeId = '') {
  const role = roleOf(project, email)
  if (!role) return no('Only project members can assign tasks.')
  if (isManager(role)) return yes()
  if (task.assigneeId && task.assigneeId !== email) return no('This task is assigned to someone else.')
  if (assigneeId && assigneeId !== email) return no('Contributors can only assign tasks to themselves.')
  return yes()
}

export function canArchiveTask(project, email) {
  return isManager(roleOf(project, email)) ? yes() : no('Only the owner or an admin can archive tasks.')
}

export function canComment(project, email) {
  return roleOf(project, email) ? yes() : no('Only project members can comment.')
}

// "You are the owner" style label for headers.
export function roleLabel(project, email) {
  const r = roleOf(project, email)
  return r ? `Your role: ${r}` : 'You are not a member of this project'
}
