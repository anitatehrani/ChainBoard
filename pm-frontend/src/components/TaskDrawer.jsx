import { useEffect, useRef } from 'react'
import './shell.css'

// Opens a task in a centered window over the board, so the board stays in
// place behind it. Closes with the X button, the Escape key or a click outside.
function TaskDrawer({ open, onClose, children }) {
  const panel = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'   // the page behind does not scroll
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null
  return (
    <div className="tw-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tw" role="dialog" aria-modal="true" aria-labelledby="tm-title" tabIndex={-1} ref={panel}>
        <button type="button" className="tw-close" aria-label="Close task" title="Close (Esc)" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className="tw-body">{children}</div>
      </div>
    </div>
  )
}

export default TaskDrawer
