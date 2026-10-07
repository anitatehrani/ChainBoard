import { useEffect, useId, useRef, useState } from 'react'
import { todayISO } from '../boardLogic'
import { WEEKDAYS, parseISO, addMonths, monthGrid, monthTitle, displayDate, shiftDay } from '../dateLogic'
import './datepicker.css'

// Custom calendar popover. value / onChange use "YYYY-MM-DD" ('' = no date).
function DatePicker({ value, onChange, placeholder = 'No due date', ariaLabel = 'Date', disabled = false, title }) {
  const today = todayISO()
  const start = parseISO(value) || parseISO(today)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState({ y: start.y, m: start.m })
  const [focusIso, setFocusIso] = useState(value || today)
  const root = useRef(null)
  const grid = useRef(null)
  const id = useId()

  function openCal() {
    if (disabled) return
    const p = parseISO(value) || parseISO(today)
    setView({ y: p.y, m: p.m })
    setFocusIso(value || today)
    setOpen(true)
  }
  function close(returnFocus = true) {
    setOpen(false)
    if (returnFocus) root.current?.querySelector('button.dp-trigger')?.focus()
  }
  function pick(iso) { onChange(iso); close() }

  useEffect(() => {
    if (!open) return
    function away(e) { if (root.current && !root.current.contains(e.target)) close(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  // Move DOM focus to the focused day so arrow keys work.
  useEffect(() => {
    if (open) grid.current?.querySelector(`[data-iso="${focusIso}"]`)?.focus()
  }, [open, focusIso, view])

  function moveFocus(iso) {
    const p = parseISO(iso)
    setFocusIso(iso)
    setView({ y: p.y, m: p.m })
  }

  function onGridKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step) { e.preventDefault(); moveFocus(shiftDay(focusIso, step)) }
    else if (e.key === 'PageDown') { e.preventDefault(); shiftMonth(1) }
    else if (e.key === 'PageUp') { e.preventDefault(); shiftMonth(-1) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }

  function shiftMonth(delta) {
    const next = addMonths(view.y, view.m, delta)
    setView(next)
    const p = parseISO(focusIso)
    const day = Math.min(p.d, new Date(next.y, next.m + 1, 0).getDate())
    setFocusIso(`${next.y}-${String(next.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
  }

  const cells = monthGrid(view.y, view.m)
  const label = displayDate(value)

  return (
    <div className={`dp ${open ? 'is-open' : ''}`} ref={root}>
      <button
        type="button"
        className={`dp-trigger ${label ? '' : 'is-placeholder'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-pop`}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (open ? close() : openCal())}
      >
        <span className="dp-value">{label || placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="dp-icon">
          <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="dp-pop" id={`${id}-pop`} role="dialog" aria-label={`Choose ${ariaLabel.toLowerCase()}`}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <div className="dp-title" aria-live="polite">{monthTitle(view.y, view.m)}</div>
            <button type="button" className="dp-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          <div className="dp-grid" role="grid" ref={grid} onKeyDown={onGridKey}>
            {WEEKDAYS.map(w => <div key={w} className="dp-dow" role="columnheader">{w}</div>)}
            {cells.map(c => {
              const selected = c.iso === value
              return (
                <button
                  key={c.iso}
                  type="button"
                  role="gridcell"
                  data-iso={c.iso}
                  tabIndex={c.iso === focusIso ? 0 : -1}
                  aria-selected={selected}
                  aria-current={c.iso === today ? 'date' : undefined}
                  className={`dp-day ${c.inMonth ? '' : 'is-outside'} ${selected ? 'is-selected' : ''} ${c.iso === today ? 'is-today' : ''}`}
                  onClick={() => pick(c.iso)}
                >
                  {c.day}
                </button>
              )
            })}
          </div>

          <div className="dp-foot">
            <button type="button" className="dp-link" onClick={() => pick('')} disabled={!value}>Clear</button>
            <button type="button" className="dp-link" onClick={() => pick(today)}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DatePicker
