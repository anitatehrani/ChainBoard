import test from 'node:test'
import assert from 'node:assert/strict'
import { createBusyTracker, isMutating } from './busy.js'

test('busy while at least one request is in flight', () => {
  const t = createBusyTracker()
  assert.equal(t.busy, false)
  const a = t.begin()
  const b = t.begin()
  assert.equal(t.busy, true)
  a()
  assert.equal(t.busy, true)
  b()
  assert.equal(t.busy, false)
})

test('releasing twice does not unbalance the count', () => {
  const t = createBusyTracker()
  const a = t.begin()
  t.begin()
  a(); a()
  assert.equal(t.count, 1)
})

test('subscribers are told about changes and can unsubscribe', () => {
  const t = createBusyTracker()
  const seen = []
  const off = t.subscribe(v => seen.push(v))
  const done = t.begin()
  done()
  off()
  t.begin()
  assert.deepEqual(seen, [true, false])
})

test('run releases the lock when the job fails', async () => {
  const t = createBusyTracker()
  await assert.rejects(() => t.run(async () => { throw new Error('boom') }), /boom/)
  assert.equal(t.busy, false)
})

test('run holds the lock for the whole job', async () => {
  const t = createBusyTracker()
  let during = null
  await t.run(async () => { during = t.busy })
  assert.equal(during, true)
  assert.equal(t.busy, false)
})

test('only state-changing methods take the lock', () => {
  assert.equal(isMutating(), false)
  assert.equal(isMutating('get'), false)
  assert.equal(isMutating('HEAD'), false)
  assert.equal(isMutating('POST'), true)
  assert.equal(isMutating('put'), true)
  assert.equal(isMutating('DELETE'), true)
})
