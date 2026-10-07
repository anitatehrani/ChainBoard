// Rules for the automatic background refresh, as plain functions (no React, no DOM, no network).
// Refresh only READS from the backend; it never writes to the ledger.

export const BASE_MS = 15000
export const MAX_MS = 120000

// Wait before the next refresh: the normal interval, doubling after each
// failure (backend down, network lost) up to a ceiling, so a dead backend is not hammered.
export function nextDelay(failures, base = BASE_MS, max = MAX_MS) {
  const n = Math.max(0, Math.floor(failures || 0))
  return Math.min(max, base * 2 ** Math.min(n, 10))
}

// Should a refresh run right now?
export function shouldRun({ enabled, visible, online, busy }) {
  return !!enabled && !!visible && online !== false && !busy
}

// Equal data -> keep the old object so React does not re-render and nothing flickers.
export function sameData(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b) } catch { return false }
}

// Which data a page needs to stay fresh.
//   'projects' = my project list, 'project' = the open project,
//   'board' = the board's tasks, 'task' = the open task and its history.
export function refreshTargets(page, { hasProject, hasTask, editing }) {
  switch (page) {
    case 'dashboard':
    case 'profile':
      return ['projects']
    case 'project':
      return hasProject ? ['project', 'projects'] : ['projects']
    case 'board':
      return hasProject ? ['project', 'board'] : []
    case 'task':
      return hasTask && !editing ? ['task'] : []
    default:
      return []
  }
}

// Board refresh: take the fresh copy of each task, but if one request failed
// keep what we already had for that task instead of making the card vanish.
export function mergeBoard(ids, fresh, previous) {
  const prev = new Map((previous || []).map(t => [t.taskId, t]))
  const now = new Map((fresh || []).filter(Boolean).map(t => [t.taskId, t]))
  const out = []
  for (const id of ids || []) {
    const t = now.get(id) || prev.get(id)
    if (t) out.push(t)
  }
  return out
}
