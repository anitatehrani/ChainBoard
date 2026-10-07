import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeReport, reportFileName, recordLine } from './auditLogic.js'

const base = { recordCount: 3, ledgerChecked: 3, headDigest: 'a'.repeat(64), records: [], allOnLedger: false, anyMissing: false }

test('summarizeReport: verified', () => {
  const s = summarizeReport({ ...base, allOnLedger: true })
  assert.equal(s.tone, 'good')
  assert.equal(s.title, 'Verified')
  assert.match(s.detail, /All 3 records/)
  assert.match(s.detail, /aaaaaaaa…aaaaaaaa/)
})

test('summarizeReport: a missing transaction is a problem, in words', () => {
  const s = summarizeReport({ ...base, anyMissing: true, records: [{ onLedger: true }, { onLedger: false }, { onLedger: true }] })
  assert.equal(s.tone, 'bad')
  assert.match(s.detail, /1 of 3 records could not be found/)
})

test('summarizeReport: partly checked and unreadable', () => {
  const s = summarizeReport({ ...base, ledgerChecked: 1, recordCount: 1, records: [] })
  assert.equal(s.tone, 'neutral')
  assert.match(s.detail, /1 of 1 record /)
  assert.equal(summarizeReport(null).tone, 'bad')
})

test('reportFileName is safe', () => {
  assert.equal(reportFileName({ kind: 'task', id: 'demo-t01' }), 'audit-task-demo-t01.json')
  assert.equal(reportFileName({ kind: 'project', id: '../x y' }), 'audit-project-.._x_y.json')
  assert.equal(reportFileName(null), 'audit-record-unknown.json')
})

test('recordLine', () => {
  assert.equal(recordLine({ n: 2, txId: 'abcdef1234567890', onLedger: true }), '#2 · tx abcdef1234… · on ledger')
  assert.match(recordLine({ n: 1, txId: 'x', onLedger: false }), /NOT FOUND/)
  assert.match(recordLine({ n: 1, txId: 'x', onLedger: null }), /not checked/)
})
