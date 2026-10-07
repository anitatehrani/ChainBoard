// Decisions the Task viewer makes, as plain functions (no React, no DOM, no network).
// Nothing here writes anything; status changes still go through updateStatus
// and the chaincode still enforces the real rules.

// Which status moves the UI offers. Mirrors the rule the viewer always had.
const TRANSITIONS = {
  'todo': ['in-progress'],
  'in-progress': ['todo', 'done'],
  'done': ['in-progress', 'todo']
}

export function isAllowedMove(from, to) {
  return from === to || (TRANSITIONS[from] || []).includes(to)
}

// What changed between two consecutive ledger records of the same task.
// `prev` is null for the first record. Returns short phrases in words.
export function describeChange(prev, curr, label = s => s) {
  const c = curr || {}
  if (!prev) return ['Task created']
  const p = prev || {}
  const out = []
  if (p.status !== c.status) out.push(`Status ${label(p.status)} → ${label(c.status)}`)
  if ((p.assigneeId || '') !== (c.assigneeId || '')) {
    out.push(c.assigneeId ? 'Assignee changed' : 'Assignee removed')
  }
  if (p.priority !== c.priority) out.push(`Priority ${p.priority} → ${c.priority}`)
  if ((p.dueDate || '') !== (c.dueDate || '')) out.push(c.dueDate ? `Due date set to ${c.dueDate}` : 'Due date removed')
  if (p.title !== c.title) out.push('Title edited')
  if (p.description !== c.description) out.push('Description edited')
  if ((p.attachments || []).length !== (c.attachments || []).length) out.push('File attached')
  if ((p.comments || []).length !== (c.comments || []).length) out.push('Comment added')
  if (!!p.archived !== !!c.archived) out.push(c.archived ? 'Archived' : 'Restored')
  return out.length ? out : ['Updated']
}

// history is oldest → newest (as returned by the ledger). Returns newest first
// with the change phrases and the record number, ready to render.
export function auditEntries(history, label) {
  const list = Array.isArray(history) ? history : []
  return list
    .map((h, i) => ({
      n: i + 1,
      txId: h.txId,
      timestamp: h.timestamp,
      value: h.value,
      changes: describeChange(i === 0 ? null : list[i - 1].value, h.value, label)
    }))
    .reverse()
}
