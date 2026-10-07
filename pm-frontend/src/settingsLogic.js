// Preferences for THIS browser, as plain functions (no React, no DOM, no network).
// They are display and convenience choices only. Accounts, projects, tasks and
// every audit record stay on the blockchain; nothing here is sent anywhere.
// Storage is passed in (localStorage in the app, a fake object in the tests).

export const SETTINGS_KEY = 'pm_settings'
const LEGACY_THEME_KEY = 'pm_theme'

export const DEFAULTS = Object.freeze({
  theme: 'dark',          // 'dark' | 'light' | 'system'
  textSize: 'normal',     // 'normal' | 'large'
  motion: 'system',       // 'system' | 'reduce'
  startPage: 'dashboard', // 'dashboard' | 'profile'
  showArchived: false,    // show archived tasks on boards by default
  autoRefresh: true       // re-read the open screen from the backend every ~15 s
})

const CHOICES = {
  theme: ['dark', 'light', 'system'],
  textSize: ['normal', 'large'],
  motion: ['system', 'reduce'],
  startPage: ['dashboard', 'profile']
}

// Accepts anything (corrupt JSON, old versions, hand edits) and returns a valid settings object.
export function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const out = { ...DEFAULTS }
  for (const key of Object.keys(CHOICES)) {
    if (CHOICES[key].includes(src[key])) out[key] = src[key]
  }
  if (typeof src.showArchived === 'boolean') out.showArchived = src.showArchived
  if (typeof src.autoRefresh === 'boolean') out.autoRefresh = src.autoRefresh
  return out
}

export function loadSettings(storage) {
  try {
    const text = storage.getItem(SETTINGS_KEY)
    if (text) return normalizeSettings(JSON.parse(text))
    // First run after this feature: keep the theme the old toggle saved.
    const legacy = storage.getItem(LEGACY_THEME_KEY)
    return normalizeSettings({ theme: legacy })
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(storage, settings) {
  try {
    const clean = normalizeSettings(settings)
    storage.setItem(SETTINGS_KEY, JSON.stringify(clean))
    // keep the old key in step so older code paths still read a valid theme
    if (clean.theme !== 'system') storage.setItem(LEGACY_THEME_KEY, clean.theme)
  } catch { /* storage may be unavailable (private mode); the app still works */ }
}

// 'system' follows the operating system.
export function resolveTheme(pref, systemPrefersDark) {
  if (pref === 'light' || pref === 'dark') return pref
  return systemPrefersDark ? 'dark' : 'light'
}

// The quick Light/Dark button flips what is on screen right now.
export function toggledTheme(pref, systemPrefersDark) {
  return resolveTheme(pref, systemPrefersDark) === 'dark' ? 'light' : 'dark'
}

// The attributes set on <html>; CSS reads them.
export function rootAttributes(settings, systemPrefersDark) {
  const s = normalizeSettings(settings)
  return {
    'data-theme': resolveTheme(s.theme, systemPrefersDark),
    'data-text': s.textSize,
    'data-motion': s.motion
  }
}

// What "Clear saved data in this browser" removes: nicknames and the per-project
// board lists. Never touches the ledger, the account or the login session.
export function localDataKeys(storage) {
  const keys = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k === 'pm_names' || (k && k.startsWith('pm_board_'))) keys.push(k)
  }
  return keys
}

export function clearLocalData(storage) {
  const keys = localDataKeys(storage)
  for (const k of keys) storage.removeItem(k)
  return keys.length
}

export function describeSetting(key, value) {
  const map = {
    theme: { dark: 'Dark', light: 'Light', system: 'Match my device' },
    textSize: { normal: 'Normal', large: 'Large' },
    motion: { system: 'Follow my device', reduce: 'Always reduce' },
    startPage: { dashboard: 'Dashboard', profile: 'Profile' }
  }
  return (map[key] && map[key][value]) || String(value)
}
