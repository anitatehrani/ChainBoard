// Decisions the Project page makes, as plain functions (no React, no DOM, no network).
// Read-only: they only describe data already loaded from the ledger.

// Old (pre-role) projects stored members as plain ID strings; new ones store
// {id, role}. These tolerate either shape.
export function memberId(m) { return typeof m === 'string' ? m : m.id }
export function memberRole(m) { return typeof m === 'string' ? null : m.role }

const AVATAR_PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#3b82f6', '#a855f7', '#22c55e', '#ef4444']
export function avatarColor(id) {
  const s = String(id || '')
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

export function initial(name) {
  const t = String(name || '').trim()
  return t ? t.charAt(0).toUpperCase() : '?'
}

const ROLE_ORDER = { owner: 0, admin: 1, contributor: 2 }
// Owners first, then admins, then contributors; old string-only members last.
// Stable: people with the same role keep the order they were added in.
export function sortMembers(members) {
  const list = Array.isArray(members) ? members : []
  return list
    .map((m, i) => ({ m, i, r: ROLE_ORDER[memberRole(m)] ?? 3 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.m)
}

export function roleSummary(members) {
  const out = { owner: 0, admin: 0, contributor: 0 }
  for (const m of Array.isArray(members) ? members : []) {
    const r = memberRole(m)
    if (r in out) out[r] += 1
  }
  return out
}

export function roleHelp(role) {
  if (role === 'owner') return 'Owner: full control'
  if (role === 'admin') return 'Admin: manages members and tasks'
  if (role === 'contributor') return 'Contributor: works on tasks'
  return ''
}

// What changed between two consecutive ledger records of the same project.
export function describeProjectChange(prev, curr, nameOf = x => x) {
  if (!prev) return ['Project created']
  const out = []
  if (prev.status !== curr.status) {
    out.push(curr.status === 'archived' ? 'Archived' : `Status ${prev.status} → ${curr.status}`)
  }
  const before = new Map((prev.members || []).map(m => [memberId(m), memberRole(m)]))
  for (const m of curr.members || []) {
    const id = memberId(m)
    if (!before.has(id)) out.push(`${nameOf(id)} joined${memberRole(m) ? ` as ${memberRole(m)}` : ''}`)
    else if (before.get(id) !== memberRole(m) && memberRole(m)) out.push(`${nameOf(id)} is now ${memberRole(m)}`)
  }
  const now = new Set((curr.members || []).map(memberId))
  for (const id of before.keys()) if (!now.has(id)) out.push(`${nameOf(id)} left`)
  if (prev.name !== curr.name) out.push('Name edited')
  if (prev.description !== curr.description) out.push('Description edited')
  return out.length ? out : ['Updated']
}

// history is oldest → newest; returns newest first with record numbers.
export function projectAuditEntries(history, nameOf) {
  const list = Array.isArray(history) ? history : []
  return list
    .map((h, i) => ({
      n: i + 1,
      txId: h.txId,
      value: h.value,
      changes: describeProjectChange(i === 0 ? null : list[i - 1].value, h.value, nameOf)
    }))
    .reverse()
}
