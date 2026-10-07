import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMAIL_RE, normalizeUsername, usernameHint, suggestUsername,
  usernameStatus, signupBlocker, describeEvents
} from './authLogic.js'

test('normalizeUsername', () => {
  assert.equal(normalizeUsername('  @Anita.T '), 'anita.t')
  assert.equal(normalizeUsername(undefined), '')
})

test('usernameHint mirrors the server rule', () => {
  assert.equal(usernameHint('anita'), null)
  assert.equal(usernameHint('a.b_c9'), null)
  assert.match(usernameHint('ab'), /3-24/)
  assert.match(usernameHint('.abc'), /3-24/)
  assert.match(usernameHint('Abc'), /3-24/)
  assert.match(usernameHint('a'.repeat(25)), /3-24/)
  assert.match(usernameHint('a..b'), /next to each other/)
})

test('suggestUsername', () => {
  assert.equal(suggestUsername('Anita.TN@x.com'), 'anita.tn')
  assert.equal(suggestUsername('ab@x.com'), '')
  assert.equal(suggestUsername('a+b+c@x.com'), 'a.b.c')
  assert.ok(suggestUsername('x'.repeat(40) + '@y.z').length <= 24)
})

test('EMAIL_RE', () => {
  assert.ok(EMAIL_RE.test('a@b.co'))
  assert.ok(!EMAIL_RE.test('a@b'))
  assert.ok(!EMAIL_RE.test('a b@c.de'))
})

test('usernameStatus words and tones', () => {
  assert.deepEqual(usernameStatus({ state: 'ok' }), { text: '✓ Available', tone: 'good' })
  assert.deepEqual(usernameStatus({ state: 'checking' }), { text: 'Checking…', tone: 'neutral' })
  assert.deepEqual(usernameStatus({ state: 'bad', reason: 'Taken.' }), { text: 'Taken.', tone: 'bad' })
  assert.equal(usernameStatus({ state: 'error', reason: 'x' }).tone, 'neutral')
  assert.match(usernameStatus({ state: 'idle' }).text, /sign in with it/)
  assert.match(usernameStatus(undefined).text, /sign in with it/)
})

test('signupBlocker reports the first unmet thing, null when ready', () => {
  const ok = { name: 'A', email: 'a@b.co', avail: { state: 'ok' }, passwordProblems: [], password: 'x', confirm: 'x' }
  assert.equal(signupBlocker(ok), null)
  assert.match(signupBlocker({ ...ok, name: ' ' }), /full name/)
  assert.match(signupBlocker({ ...ok, email: 'nope' }), /valid email/)
  assert.match(signupBlocker({ ...ok, avail: { state: 'idle' } }), /Choose a username/)
  assert.match(signupBlocker({ ...ok, avail: { state: 'bad' } }), /different username/)
  assert.equal(signupBlocker({ ...ok, avail: { state: 'error' } }), null)
  assert.match(signupBlocker({ ...ok, passwordProblems: ['x'] }), /every rule/)
  assert.match(signupBlocker({ ...ok, confirm: '' }), /Confirm/)
  assert.match(signupBlocker({ ...ok, confirm: 'y' }), /do not match/)
})

test('describeEvents: sentences, newest first', () => {
  const v = { passwordChanges: 0, hasPassword: true, googleLinked: false, emailVerified: false, projectCount: 0 }
  const events = [
    { txId: 'a', value: v },
    { txId: 'b', value: { ...v, passwordChanges: 1 } },
    { txId: 'c', value: { ...v, passwordChanges: 1, googleLinked: true } },
    { txId: 'd', value: { ...v, passwordChanges: 1, googleLinked: true, emailVerified: true } },
    { txId: 'e', value: { ...v, passwordChanges: 1, googleLinked: true, emailVerified: true, projectCount: 1 } },
    { txId: 'f', value: { ...v, passwordChanges: 1, googleLinked: true, emailVerified: true, projectCount: 1 } }
  ]
  assert.deepEqual(describeEvents(events).map(e => e.text), [
    'Account updated', 'Added to a project', 'Email address confirmed',
    'Google account connected', 'Password changed', 'Account created'
  ])
  assert.deepEqual(describeEvents(undefined), [])
})

test('describeEvents: first password on a Google-only account says "set"', () => {
  const g = { passwordChanges: 0, hasPassword: false, googleLinked: true, emailVerified: true, projectCount: 0 }
  const out = describeEvents([{ txId: 'a', value: g }, { txId: 'b', value: { ...g, passwordChanges: 1, hasPassword: true } }])
  assert.equal(out[0].text, 'Password set')
})
