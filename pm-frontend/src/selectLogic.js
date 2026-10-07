// Pure helpers for the Select component (no React, unit-tested).

// Case- and accent-insensitive; every word typed must appear in the label or hint.
function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filterOptions(options, query) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return options
  return options.filter(o => {
    const hay = fold(`${o.label} ${o.hint || ''}`)
    return words.every(w => hay.includes(w))
  })
}

// Moves the highlighted index, wrapping around. Returns -1 for an empty list.
export function moveIndex(current, delta, length) {
  if (length <= 0) return -1
  if (current < 0) return delta > 0 ? 0 : length - 1
  return (current + delta + length) % length
}

// Search box only when it helps: many options, or forced by the caller.
export function showSearch(optionCount, searchable) {
  if (searchable === true) return true
  if (searchable === false) return false
  return optionCount > 6
}

export function selectedLabel(options, value, placeholder) {
  const hit = options.find(o => o.value === value)
  return hit ? hit.label : placeholder
}
