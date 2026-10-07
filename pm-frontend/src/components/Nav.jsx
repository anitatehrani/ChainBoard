import { navTabs, tabAriaLabel } from '../navLogic'
import './nav.css'

const svg = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

const TAB_ICONS = {
  dashboard: <svg {...svg}><rect x="2" y="2" width="5" height="5" rx="1.2" /><rect x="9" y="2" width="5" height="5" rx="1.2" /><rect x="2" y="9" width="5" height="5" rx="1.2" /><rect x="9" y="9" width="5" height="5" rx="1.2" /></svg>,
  project: <svg {...svg}><path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.8h4.5A1.5 1.5 0 0114 6.3v5.2a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" /></svg>,
  board: <svg {...svg}><rect x="2" y="2.5" width="3.2" height="11" rx="1" /><rect x="6.4" y="2.5" width="3.2" height="7" rx="1" /><rect x="10.8" y="2.5" width="3.2" height="9" rx="1" /></svg>,
  task: <svg {...svg}><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.5 8.2l1.8 1.8 3.2-3.6" /></svg>
}

// The four screens, centred under the header. The account menu lives in the header.
function Nav({ page, setPage, hasProject, hasTask }) {
  const tabs = navTabs({ hasProject, hasTask })
  return (
    <nav className="nav nav-bar" aria-label="Main">
      <div className="nav-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${page === t.id ? 'active' : ''}`}
            disabled={!t.enabled}
            aria-current={page === t.id ? 'page' : undefined}
            aria-label={tabAriaLabel(t)}
            onClick={() => setPage(t.id)}
            title={t.reason}
          >
            {TAB_ICONS[t.id]}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}

export default Nav
