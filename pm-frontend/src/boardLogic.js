// Decisions the Task board makes about a card, as plain functions.
// No React, no DOM, no network: they only look at data that is already loaded
// (the task objects that come from the ledger) and return what to show.
// Nothing here writes anything; status changes still go through updateStatus.

const DAY_MS = 24 * 60 * 60 * 1000

// Local calendar date as YYYY-MM-DD (the format <input type="date"> stores).
export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
}

// Whole days from `today` to `dueDate` (negative = in the past). null if no/invalid date.
export function daysUntil(dueDate, today) {
  const due = dayNumber(dueDate)
  const now = dayNumber(today)
  if (due === null || now === null) return null
  return Math.round(due - now)
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The due date in words, so the state never depends on colour alone.
export function dueLabel(dueDate, today) {
  const n = daysUntil(dueDate, today)
  if (n === null) return ''
  if (n < 0) return `Overdue by ${plural(-n, 'day')}`
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  if (n <= 7) return `Due in ${plural(n, 'day')}`
  return `Due ${dueDate}`
}

// One place that decides how a card looks.
//   state: 'archived' | 'done' | 'overdue' | 'open'
//   A finished or archived task is never "overdue".
export function cardState(task, today) {
  const n = daysUntil(task.dueDate, today)
  let state = 'open'
  if (task.archived) state = 'archived'
  else if (task.status === 'done') state = 'done'
  else if (n !== null && n < 0) state = 'overdue'
  return {
    state,
    status: task.status,
    overdue: state === 'overdue',
    dueText: task.dueDate ? dueLabel(task.dueDate, today) : '',
    dueSoon: state === 'open' && n !== null && n >= 0 && n <= 2
  }
}

export const TASK_SEARCH_MIN_CHARS = 3
export const UNASSIGNED = '__unassigned'

// Whether the text is long enough to filter by (shorter text is ignored).
export function taskSearchActive(query) {
  return String(query || '').trim().length >= TASK_SEARCH_MIN_CHARS
}

// Board filtering. Every option is optional and they combine (all must match):
//   showArchived  include archived tasks
//   assignee      an id, or UNASSIGNED for tasks nobody has taken
//   priority      one priority (older single-value option)
//   priorities    several priorities at once, e.g. ['high', 'medium']
//   due           'overdue' | 'week' (today..7 days, still open) | 'none' (no due date)
//   query         words that must all appear in the title or description (3+ characters)
//   today         YYYY-MM-DD, for the due filters
export function filterTasks(tasks, {
  showArchived = false, assignee = '', priority = '', priorities = [], due = '', query = '', today = todayISO()
} = {}) {
  const words = taskSearchActive(query) ? String(query).toLowerCase().split(/\s+/).filter(Boolean) : []
  const wanted = Array.isArray(priorities) ? priorities : []
  return tasks.filter(t => {
    if (!showArchived && t.archived) return false
    if (assignee === UNASSIGNED ? !!t.assigneeId : (assignee && t.assigneeId !== assignee)) return false
    if (priority && t.priority !== priority) return false
    if (wanted.length && !wanted.includes(t.priority)) return false
    if (due) {
      const n = daysUntil(t.dueDate, today)
      const open = !t.archived && t.status !== 'done'
      if (due === 'overdue' && !cardState(t, today).overdue) return false
      if (due === 'week' && !(open && n !== null && n >= 0 && n <= 7)) return false
      if (due === 'none' && t.dueDate) return false
    }
    if (words.length) {
      const hay = `${t.title || ''} ${t.description || ''}`.toLowerCase()
      if (!words.every(w => hay.includes(w))) return false
    }
    return true
  })
}

// How many filters are switched on (the archived toggle is a view option, not a filter).
export function activeFilterCount({ assignee = '', priorities = [], due = '', query = '' } = {}) {
  return (assignee ? 1 : 0) + (priorities && priorities.length ? 1 : 0) + (due ? 1 : 0) + (taskSearchActive(query) ? 1 : 0)
}

// Numbers shown on the quick-filter chips (archived tasks are not work, so not counted).
export function filterCounts(tasks, today = todayISO()) {
  const live = tasks.filter(t => !t.archived)
  return {
    overdue: live.filter(t => cardState(t, today).overdue).length,
    week: filterTasks(live, { due: 'week', today }).length,
    none: live.filter(t => !t.dueDate).length,
    unassigned: live.filter(t => !t.assigneeId).length
  }
}

export function groupByColumn(tasks, columns) {
  const groups = {}
  for (const c of columns) groups[c] = []
  for (const t of tasks) if (groups[t.status]) groups[t.status].push(t)
  return groups
}

// Short text for the card's accessible name: "Title, high priority, In Progress, Overdue by 2 days"
export function cardAriaLabel(task, statusLabel, today) {
  const { dueText } = cardState(task, today)
  return [
    task.title,
    task.priority ? `${task.priority} priority` : '',
    statusLabel,
    task.archived ? 'archived' : '',
    dueText
  ].filter(Boolean).join(', ')
}
