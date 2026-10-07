import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULTS, SETTINGS_KEY, normalizeSettings, loadSettings, saveSettings, resolveTheme,
  toggledTheme, rootAttributes, localDataKeys, clearLocalData, describeSetting
} from './settingsLogic.js'

function fakeStorage(initial = {}) {
  const data = { ...initial }
  return {
    get length() { return Object.keys(data).length },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
    dump: () => ({ ...data })
  }
}

test('normalizeSettings repairs anything', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULTS)
  assert.deepEqual(normalizeSettings('nope'), DEFAULTS)
  assert.deepEqual(normalizeSettings({ theme: 'pink', textSize: 'huge', showArchived: 'yes' }), DEFAULTS)
  assert.deepEqual(
    normalizeSettings({ theme: 'light', textSize: 'large', motion: 'reduce', startPage: 'profile', showArchived: true, autoRefresh: false }),
    { theme: 'light', textSize: 'large', motion: 'reduce', startPage: 'profile', showArchived: true, autoRefresh: false }
  )
  assert.equal(DEFAULTS.autoRefresh, true)
  assert.equal(normalizeSettings({ autoRefresh: 'no' }).autoRefresh, true)
})

test('loadSettings: defaults, saved, corrupt, legacy theme', () => {
  assert.deepEqual(loadSettings(fakeStorage()), DEFAULTS)
  assert.equal(loadSettings(fakeStorage({ pm_theme: 'light' })).theme, 'light')
  assert.deepEqual(loadSettings(fakeStorage({ [SETTINGS_KEY]: '{not json' })), DEFAULTS)
  assert.equal(loadSettings(fakeStorage({ [SETTINGS_KEY]: JSON.stringify({ textSize: 'large' }) })).textSize, 'large')
  // saved settings win over the legacy key
  assert.equal(loadSettings(fakeStorage({ pm_theme: 'light', [SETTINGS_KEY]: JSON.stringify({ theme: 'dark' }) })).theme, 'dark')
})

test('saveSettings round-trips and keeps the legacy key valid', () => {
  const s = fakeStorage()
  saveSettings(s, { theme: 'light', textSize: 'large' })
  assert.equal(loadSettings(s).theme, 'light')
  assert.equal(loadSettings(s).textSize, 'large')
  assert.equal(s.getItem('pm_theme'), 'light')
  saveSettings(s, { theme: 'system' })
  assert.equal(s.getItem('pm_theme'), 'light') // untouched for 'system'
})

test('saveSettings never throws when storage fails', () => {
  const broken = { setItem() { throw new Error('quota') } }
  assert.doesNotThrow(() => saveSettings(broken, DEFAULTS))
})

test('resolveTheme and toggledTheme', () => {
  assert.equal(resolveTheme('dark', false), 'dark')
  assert.equal(resolveTheme('light', true), 'light')
  assert.equal(resolveTheme('system', true), 'dark')
  assert.equal(resolveTheme('system', false), 'light')
  assert.equal(toggledTheme('dark', false), 'light')
  assert.equal(toggledTheme('light', false), 'dark')
  assert.equal(toggledTheme('system', true), 'light')
})

test('rootAttributes', () => {
  assert.deepEqual(rootAttributes({ theme: 'system', textSize: 'large', motion: 'reduce' }, true),
    { 'data-theme': 'dark', 'data-text': 'large', 'data-motion': 'reduce' })
  assert.deepEqual(rootAttributes(undefined, false),
    { 'data-theme': 'dark', 'data-text': 'normal', 'data-motion': 'system' })
})

test('clearLocalData removes only nicknames and board lists', () => {
  const s = fakeStorage({
    pm_names: '{}', pm_board_p1: '["t1"]', pm_board_p2: '[]',
    [SETTINGS_KEY]: '{}', pm_theme: 'dark', other: 'keep'
  })
  assert.deepEqual(localDataKeys(s).sort(), ['pm_board_p1', 'pm_board_p2', 'pm_names'])
  assert.equal(clearLocalData(s), 3)
  assert.deepEqual(Object.keys(s.dump()).sort(), ['other', 'pm_settings', 'pm_theme'])
  assert.equal(clearLocalData(s), 0)
})

test('describeSetting', () => {
  assert.equal(describeSetting('theme', 'system'), 'Match my device')
  assert.equal(describeSetting('motion', 'reduce'), 'Always reduce')
  assert.equal(describeSetting('unknown', 'x'), 'x')
})
