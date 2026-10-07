import test from 'node:test'
import assert from 'node:assert/strict'
import { parseISO, toISO, addMonths, monthGrid, monthTitle, displayDate, shiftDay } from './dateLogic.js'

test('parseISO accepts real dates only', () => {
  assert.deepEqual(parseISO('2026-10-07'), { y: 2026, m: 9, d: 7 })
  assert.equal(parseISO('2026-02-30'), null)
  assert.equal(parseISO('2026-13-01'), null)
  assert.equal(parseISO(''), null)
  assert.equal(parseISO('7/10/2026'), null)
})

test('toISO pads and is 0-based on month', () => {
  assert.equal(toISO(2026, 0, 5), '2026-01-05')
  assert.equal(toISO(2026, 11, 31), '2026-12-31')
})

test('addMonths rolls the year both ways', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { y: 2027, m: 0 })
  assert.deepEqual(addMonths(2026, 0, -1), { y: 2025, m: 11 })
  assert.deepEqual(addMonths(2026, 5, 14), { y: 2027, m: 7 })
})

test('monthGrid: 42 cells, Monday first, marks the month', () => {
  const g = monthGrid(2026, 9) // October 2026 starts on a Thursday
  assert.equal(g.length, 42)
  assert.equal(g[0].iso, '2026-09-28')
  assert.equal(g[3].iso, '2026-10-01')
  assert.equal(g[3].inMonth, true)
  assert.equal(g[0].inMonth, false)
  assert.equal(g.filter(c => c.inMonth).length, 31)
})

test('monthGrid handles a month starting on Monday and February in a leap year', () => {
  assert.equal(monthGrid(2026, 5)[0].iso, '2026-06-01') // 1 June 2026 is a Monday
  assert.equal(monthGrid(2028, 1).filter(c => c.inMonth).length, 29)
})

test('titles and display text', () => {
  assert.equal(monthTitle(2026, 9), 'October 2026')
  assert.equal(displayDate('2026-10-07'), 'Wed, 7 Oct 2026')
  assert.equal(displayDate(''), '')
})

test('shiftDay crosses month and year boundaries', () => {
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01')
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftDay('2026-10-07', 7), '2026-10-14')
})
