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

// Same filtering the board always did, moved here so it can be tested.
export function filterTasks(tasks, { showArchived = false, assignee = '', priority = '' } = {}) {
  return tasks.filter(t =>
    (showArchived || !t.archived) &&
    (!assignee || t.assigneeId === assignee) &&
    (!priority || t.priority === priority)
  )
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
