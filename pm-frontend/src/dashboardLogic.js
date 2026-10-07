// Decisions the Dashboard makes, as plain functions (no React, no DOM, no network).
// Read-only: they only describe data that is already loaded from the ledger.

import { cardState } from './boardLogic.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function memberCountLabel(members) {
  return plural(Array.isArray(members) ? members.length : 0, 'member')
}

// 'active' | 'archived' (anything else is shown as given, never hidden)
export function projectState(project) {
  return project && project.status === 'archived' ? 'archived' : 'active'
}

// Counts for the summary strip. Archived tasks are not counted as work.
//   percentDone is whole-number 0..100, 0 when there are no tasks.
export function taskSummary(tasks, columns = ['todo', 'in-progress', 'done'], today) {
  const live = (Array.isArray(tasks) ? tasks : []).filter(t => !t.archived)
  const counts = {}
  for (const c of columns) counts[c] = 0
  let overdue = 0
  for (const t of live) {
    if (t.status in counts) counts[t.status] += 1
    if (cardState(t, today).overdue) overdue += 1
  }
  const total = live.length
  const done = counts.done || 0
  return {
    counts,
    total,
    overdue,
    percentDone: total === 0 ? 0 : Math.round((done / total) * 100)
  }
}

// ── project overview helpers ──

// "Good morning" / "Good afternoon" / "Good evening" from the viewer's local hour.
export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 5) return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// The person's role in a project: 'owner' | 'admin' | 'contributor' | null.
// Old projects stored plain strings, which the ledger treats as contributors.
export function roleIn(project, email) {
  const members = project && Array.isArray(project.members) ? project.members : []
  for (const m of members) {
    const id = typeof m === 'string' ? m : m && m.id
    if (id === email) return typeof m === 'string' ? 'contributor' : (m.role || 'contributor')
  }
  return null
}

// Header numbers: total, active, archived, and how many the person owns.
export function projectCounts(projects, email) {
  const list = Array.isArray(projects) ? projects : []
  const archived = list.filter(p => projectState(p) === 'archived').length
  return {
    total: list.length,
    active: list.length - archived,
    archived,
    owned: list.filter(p => roleIn(p, email) === 'owner').length
  }
}

// Searching starts at 3 characters; shorter text is ignored (everything stays listed).
export const SEARCH_MIN_CHARS = 3

export function searchIsActive(query) {
  return String(query || '').trim().length >= SEARCH_MIN_CHARS
}

// Search by name, description or id; status is 'all' | 'active' | 'archived'.
// Active projects first, then by name (case-insensitive), without changing the input.
export function filterProjects(projects, { query = '', status = 'all' } = {}) {
  const words = searchIsActive(query) ? String(query).toLowerCase().split(/\s+/).filter(Boolean) : []
  return (Array.isArray(projects) ? projects : [])
    .filter(p => status === 'all' || projectState(p) === status)
    .filter(p => {
      const hay = `${p.name || ''} ${p.description || ''} ${p.projectId || ''}`.toLowerCase()
      return words.every(w => hay.includes(w))
    })
    .slice()
    .sort((a, b) => {
      const sa = projectState(a) === 'archived' ? 1 : 0
      const sb = projectState(b) === 'archived' ? 1 : 0
      return (sa - sb) || String(a.name || '').toLowerCase().localeCompare(String(b.name || '').toLowerCase())
    })
}

export function summaryText(s) {
  if (s.total === 0) return 'No tasks yet'
  const base = `${s.percentDone}% done · ${plural(s.total, 'task')}`
  return s.overdue > 0 ? `${base} · ${s.overdue} overdue` : base
}
