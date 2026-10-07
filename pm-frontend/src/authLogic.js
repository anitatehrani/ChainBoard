// Decisions the sign-in, sign-up and Account screens make, as plain functions
// (no React, no DOM, no network). The server re-checks every rule; these only
// give instant feedback and describe data already loaded from the ledger.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeUsername(raw) {
  return String(raw || '').trim().replace(/^@/, '').toLowerCase()
}

export function usernameHint(u) {
  if (!/^[a-z0-9][a-z0-9._]{2,23}$/.test(u)) {
    return 'Use 3-24 lowercase letters, digits, "." or "_", starting with a letter or digit.'
  }
  if (/[._]{2}/.test(u)) return 'No two "." or "_" characters next to each other.'
  return null
}

export function suggestUsername(email) {
  let base = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '.')
  base = base.replace(/[._]{2,}/g, '.').replace(/^[._]+/, '').replace(/[._]+$/, '')
  if (base.length < 3) return ''
  return base.slice(0, 24).replace(/[._]+$/, '')
}

// The username status line: one place decides the words and the tone.
//   avail = { state: 'idle'|'checking'|'ok'|'bad'|'error', reason }
//   tone  = 'neutral' | 'good' | 'bad'
export function usernameStatus(avail) {
  switch (avail && avail.state) {
    case 'checking': return { text: 'Checking…', tone: 'neutral' }
    case 'ok': return { text: '✓ Available', tone: 'good' }
    case 'bad': return { text: avail.reason || 'Not available.', tone: 'bad' }
    case 'error': return { text: avail.reason || 'Could not check right now.', tone: 'neutral' }
    default: return { text: 'People can sign in with it and find you by it. 3-24 characters.', tone: 'neutral' }
  }
}

// Why the "Create account" button is disabled, in words (first unmet thing).
export function signupBlocker({ name, email, avail, passwordProblems, password, confirm }) {
  if (!String(name || '').trim()) return 'Enter your full name.'
  if (!EMAIL_RE.test(String(email || '').trim())) return 'Enter a valid email address.'
  if (!(avail && (avail.state === 'ok' || avail.state === 'error'))) {
    return avail && avail.state === 'bad' ? 'Choose a different username.' : 'Choose a username.'
  }
  if (passwordProblems && passwordProblems.length > 0) return 'Make the password meet every rule below it.'
  if (!confirm) return 'Confirm your password.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

// Turns the account's ledger history into readable sentences by looking at
// what changed between one on-chain version and the next. Newest first.
export function describeEvents(events) {
  const out = []
  const list = Array.isArray(events) ? events : []
  list.forEach((e, i) => {
    const prev = i > 0 ? list[i - 1].value : null
    const v = e.value
    const base = { txId: e.txId, timestamp: e.timestamp }
    if (!prev) { out.push({ ...base, text: 'Account created' }); return }
    let described = false
    if (v.passwordChanges > prev.passwordChanges) {
      out.push({ ...base, text: prev.hasPassword ? 'Password changed' : 'Password set' }); described = true
    }
    if (v.googleLinked !== prev.googleLinked) {
      out.push({ ...base, text: v.googleLinked ? 'Google account connected' : 'Google account disconnected' }); described = true
    }
    if (v.emailVerified && !prev.emailVerified) {
      out.push({ ...base, text: 'Email address confirmed' }); described = true
    }
    if (v.projectCount > prev.projectCount) {
      out.push({ ...base, text: 'Added to a project' }); described = true
    }
    if (!described) out.push({ ...base, text: 'Account updated' })
  })
  return out.reverse()
}
