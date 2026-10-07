import { useEffect, useRef, useState } from 'react'
import { firstName } from '../navLogic'
import { avatarColor, initial } from '../projectLogic'
import './nav.css'

const svg = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const ICON_USER = <svg {...svg}><circle cx="8" cy="5.5" r="2.7" /><path d="M2.8 13.5c.6-2.4 2.6-3.7 5.2-3.7s4.6 1.3 5.2 3.7" /></svg>
const ICON_GEAR = <svg {...svg}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /></svg>
const ICON_LOGOUT = <svg {...svg}><path d="M6 2.5H3.8A1.3 1.3 0 002.5 3.8v8.4a1.3 1.3 0 001.3 1.3H6M10 5l3 3-3 3M13 8H6.5" /></svg>
const ICON_SUN = <svg {...svg}><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" /></svg>
const ICON_MOON = <svg {...svg}><path d="M13.5 9.6A5.7 5.7 0 016.4 2.5a5.7 5.7 0 107.1 7.1z" /></svg>
const CHEVRON = <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>

// Top-right account dropdown: profile, settings, theme and sign out.
function AccountMenu({ currentUser, page, setPage, onLogout, theme, onToggleTheme }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const menu = useRef(null)
  const onProfileArea = page === 'profile' || page === 'settings' || page === 'account'

  function close(returnFocus = false) {
    setOpen(false)
    if (returnFocus) root.current?.querySelector('.nav-profile')?.focus()
  }
  function go(target) { close(); setPage(target) }

  useEffect(() => {
    if (!open) return
    function away(e) { if (root.current && !root.current.contains(e.target)) close() }
    document.addEventListener('mousedown', away)
    menu.current?.querySelector('[role="menuitem"]')?.focus()
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  function onKeyDown(e) {
    if (!open) return
    const items = [...(menu.current?.querySelectorAll('[role="menuitem"]') || [])]
    const at = items.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(at + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(at - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Tab') close()
  }

  const dark = theme === 'dark'

  return (
    <div className="nav-menu" ref={root} onKeyDown={onKeyDown}>
      <button
        className={`nav-profile ${onProfileArea || open ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${currentUser.name}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="nav-avatar" aria-hidden="true" style={{ background: avatarColor(currentUser.email) }}>
          {initial(currentUser.name)}
        </span>
        <span className="nav-profile-name">{firstName(currentUser.name) || 'Account'}</span>
        <span className={`nav-chevron ${open ? 'open' : ''}`}>{CHEVRON}</span>
      </button>

      {open && (
        <div className="nav-popover" role="menu" ref={menu} aria-label="Account">
          <div className="nav-popover-head">
            <span className="nav-avatar lg" aria-hidden="true" style={{ background: avatarColor(currentUser.email) }}>
              {initial(currentUser.name)}
            </span>
            <span className="nav-popover-who">
              <span className="nav-popover-name">{currentUser.name}</span>
              <span className="nav-popover-email">{currentUser.email}</span>
            </span>
          </div>
          <div className="nav-popover-sep" role="separator" />
          <button role="menuitem" className="nav-popover-item" onClick={() => go('profile')}>{ICON_USER}View profile</button>
          <button role="menuitem" className="nav-popover-item" onClick={() => go('settings')}>{ICON_GEAR}Settings</button>
          <button role="menuitem" className="nav-popover-item" onClick={() => { onToggleTheme(); close() }}>
            {dark ? ICON_SUN : ICON_MOON}
            {dark ? 'Switch to light mode' : 'Switch to dark mode'}
          </button>
          <div className="nav-popover-sep" role="separator" />
          <button role="menuitem" className="nav-popover-item danger" onClick={() => { close(); onLogout() }}>{ICON_LOGOUT}Sign out</button>
        </div>
      )}
    </div>
  )
}

export default AccountMenu
