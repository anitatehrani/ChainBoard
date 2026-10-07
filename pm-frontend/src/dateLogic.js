// Pure date helpers for the DatePicker (no React, unit-tested). Dates are
// "YYYY-MM-DD" strings, the same format the ledger stores.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December']
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = n => String(n).padStart(2, '0')

export function toISO(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}` } // m is 0-based

// Returns { y, m (0-based), d } or null for anything that is not a real date.
export function parseISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!match) return null
  const y = +match[1], m = +match[2] - 1, d = +match[3]
  const dt = new Date(y, m, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null
  return { y, m, d }
}

export function monthTitle(y, m) { return `${MONTHS[m]} ${y}` }

// Adds whole months, rolling the year over in either direction.
export function addMonths(y, m, delta) {
  const t = y * 12 + m + delta
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 }
}

// 6 rows x 7 columns, weeks starting Monday. Each cell: { iso, day, inMonth }.
export function monthGrid(y, m) {
  const first = new Date(y, m, 1)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const cells = []
  for (let i = 0; i < 42; i++) {
    const dt = new Date(y, m, 1 - offset + i)
    cells.push({
      iso: toISO(dt.getFullYear(), dt.getMonth(), dt.getDate()),
      day: dt.getDate(),
      inMonth: dt.getMonth() === m
    })
  }
  return cells
}

// "Wed, 7 Oct 2026" for the trigger; '' when empty or invalid.
export function displayDate(iso) {
  const p = parseISO(iso)
  if (!p) return ''
  const dt = new Date(p.y, p.m, p.d)
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()]
  return `${wd}, ${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`
}

// Keyboard moves inside the grid: returns the new ISO date.
export function shiftDay(iso, days) {
  const p = parseISO(iso)
  if (!p) return iso
  const dt = new Date(p.y, p.m, p.d + days)
  return toISO(dt.getFullYear(), dt.getMonth(), dt.getDate())
}
