import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { filterOptions, moveIndex, showSearch, selectedLabel } from '../selectLogic'
import './select.css'

// Accessible custom dropdown (combobox + listbox pattern) with optional search.
// options: [{ value, label, hint? }]. A value of '' is a valid "none" choice.
function Select({
  value, onChange, options, placeholder = 'Select…', ariaLabel,
  searchable, disabled = false, size = 'md', title
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const root = useRef(null)
  const search = useRef(null)
  const list = useRef(null)
  const id = useId()

  const withSearch = showSearch(options.length, searchable)
  const shown = useMemo(() => filterOptions(options, query), [options, query])
  const label = selectedLabel(options, value, placeholder)
  const hasValue = options.some(o => o.value === value && o.value !== '')

  function openMenu() {
    if (disabled) return
    setQuery('')
    const at = options.findIndex(o => o.value === value)
    setActive(at)
    setOpen(true)
  }
  function close() { setOpen(false); setQuery('') }
  function choose(opt) {
    onChange(opt.value)
    close()
    root.current?.querySelector('button.select-trigger')?.focus()
  }

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function away(e) { if (root.current && !root.current.contains(e.target)) close() }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  // Focus the search box (or list) on open; keep the active row in view.
  useEffect(() => {
    if (open && withSearch) search.current?.focus()
  }, [open, withSearch])
  useEffect(() => {
    if (!open || active < 0) return
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])
  useEffect(() => { setActive(shown.length ? 0 : -1) }, [query]) // eslint-disable-line

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => moveIndex(i, 1, shown.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => moveIndex(i, -1, shown.length)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(shown.length ? 0 : -1) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]) }
    else if (e.key === ' ' && !withSearch) { e.preventDefault(); if (shown[active]) choose(shown[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); close(); root.current?.querySelector('button.select-trigger')?.focus() }
    else if (e.key === 'Tab') { close() }
  }

  const listId = `${id}-list`

  return (
    <div className={`select select-${size} ${open ? 'is-open' : ''}`} ref={root} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`select-trigger ${hasValue ? '' : 'is-placeholder'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
      >
        <span className="select-value">{label}</span>
        <svg className="select-chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="select-menu">
          {withSearch && (
            <div className="select-search">
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={search}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
                autoComplete="off"
              />
            </div>
          )}
          <ul className="select-list" role="listbox" id={listId} ref={list} aria-label={ariaLabel}>
            {shown.length === 0 && <li className="select-empty" role="presentation">No matches</li>}
            {shown.map((o, i) => (
              <li
                key={o.value === '' ? '__none' : o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                className={`select-option ${i === active ? 'is-active' : ''} ${o.value === value ? 'is-selected' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span className="select-option-text">
                  <span className="select-option-label">{o.label}</span>
                  {o.hint && <span className="select-option-hint">{o.hint}</span>}
                </span>
                {o.value === value && (
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default Select
