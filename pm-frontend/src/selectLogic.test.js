import test from 'node:test'
import assert from 'node:assert/strict'
import { filterOptions, moveIndex, showSearch, selectedLabel } from './selectLogic.js'

const opts = [
  { value: 'g', label: 'Giulia Bianchi', hint: '@giulia.bianchi' },
  { value: 'l', label: 'Luca Ferrari', hint: '@luca.ferrari' },
  { value: 'n', label: 'Nicolò Verdi', hint: '@nicolo' }
]

test('filterOptions: empty query keeps everything', () => {
  assert.equal(filterOptions(opts, '  ').length, 3)
})

test('filterOptions matches label or hint, ignoring case and accents', () => {
  assert.deepEqual(filterOptions(opts, 'FERR').map(o => o.value), ['l'])
  assert.deepEqual(filterOptions(opts, '@giulia').map(o => o.value), ['g'])
  assert.deepEqual(filterOptions(opts, 'nicolo').map(o => o.value), ['n'])
})

test('filterOptions needs every word to match', () => {
  assert.deepEqual(filterOptions(opts, 'luca ferr').map(o => o.value), ['l'])
  assert.equal(filterOptions(opts, 'luca bianchi').length, 0)
})

test('moveIndex wraps and handles empty lists', () => {
  assert.equal(moveIndex(-1, 1, 3), 0)
  assert.equal(moveIndex(-1, -1, 3), 2)
  assert.equal(moveIndex(2, 1, 3), 0)
  assert.equal(moveIndex(0, -1, 3), 2)
  assert.equal(moveIndex(0, 1, 0), -1)
})

test('showSearch: automatic above six options, overridable', () => {
  assert.equal(showSearch(3), false)
  assert.equal(showSearch(7), true)
  assert.equal(showSearch(3, true), true)
  assert.equal(showSearch(30, false), false)
})

test('selectedLabel falls back to the placeholder', () => {
  assert.equal(selectedLabel(opts, 'l', 'Pick'), 'Luca Ferrari')
  assert.equal(selectedLabel(opts, '', 'Pick'), 'Pick')
})
