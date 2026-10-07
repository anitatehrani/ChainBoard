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

export function summaryText(s) {
  if (s.total === 0) return 'No tasks yet'
  const base = `${s.percentDone}% done · ${plural(s.total, 'task')}`
  return s.overdue > 0 ? `${base} · ${s.overdue} overdue` : base
}
