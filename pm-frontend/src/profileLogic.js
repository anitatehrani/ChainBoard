// Decisions the Profile page makes, as plain functions (no React, no DOM, no network).
// Read-only: a profile is derived from data the app already loaded from the ledger
// (the signed-in account, "my projects", and the public people directory).
// Nothing here writes anything, and no new on-chain field is needed.

import { memberId, memberRole } from './projectLogic.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']

// "2026-10-07T09:12:00.000Z" -> "October 2026"; '' when missing or invalid.
export function memberSince(createdAt) {
  const m = /^(\d{4})-(\d{2})-/.exec(String(createdAt || ''))
  if (!m) return ''
  const month = Number(m[2])
  if (month < 1 || month > 12) return ''
  return `${MONTHS[month - 1]} ${m[1]}`
}

// The person's role in one project ('owner' | 'admin' | 'contributor' | null).
export function roleIn(project, email) {
  const list = (project && project.members) || []
  const found = list.find(m => memberId(m) === email)
  return found ? (memberRole(found) || 'contributor') : null
}

// Counts for the stats strip. Archived projects are counted separately.
export function profileStats(projects, email) {
  const list = Array.isArray(projects) ? projects : []
  const stats = { projects: 0, archived: 0, owner: 0, admin: 0, contributor: 0 }
  for (const p of list) {
    if (p.status === 'archived') { stats.archived += 1; continue }
    stats.projects += 1
    const r = roleIn(p, email)
    if (r && r in stats) stats[r] += 1
  }
  return stats
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function statsText(stats) {
  const parts = [plural(stats.projects, 'active project')]
  if (stats.archived > 0) parts.push(`${stats.archived} archived`)
  return parts.join(' · ')
}

// Projects shared between the signed-in person and one other person, with
// the other person's role in each.
export function sharedProjects(projects, myEmail, otherEmail) {
  return (Array.isArray(projects) ? projects : [])
    .filter(p => roleIn(p, myEmail) && roleIn(p, otherEmail))
    .map(p => ({ projectId: p.projectId, name: p.name, status: p.status, role: roleIn(p, otherEmail) }))
}

// Everyone else who is in at least one of my projects, most shared projects first,
// then by name. Names come from the people directory; unregistered/legacy IDs are
// shown as the raw id so nobody silently disappears.
export function teammates(projects, myEmail, directory) {
  const dir = new Map((Array.isArray(directory) ? directory : []).map(u => [u.email, u]))
  const counts = new Map()
  for (const p of Array.isArray(projects) ? projects : []) {
    for (const m of p.members || []) {
      const id = memberId(m)
      if (id === myEmail) continue
      counts.set(id, (counts.get(id) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([email, shared]) => {
      const u = dir.get(email)
      return { email, name: (u && u.name) || email, username: (u && u.username) || '', shared }
    })
    .sort((a, b) => b.shared - a.shared || a.name.localeCompare(b.name))
}

// Short badges describing how secure/complete the account is, in words.
export function accountBadges(user) {
  if (!user) return []
  return [
    user.email_verified ? 'Email confirmed' : 'Email not confirmed',
    user.has_password ? 'Password set' : 'No password (Google only)',
    user.google_linked ? 'Google connected' : 'Google not connected'
  ]
}
