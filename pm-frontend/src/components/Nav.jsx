import { navTabs, tabAriaLabel, firstName } from '../navLogic'
import './nav.css'

function Nav({ page, setPage, hasProject, hasTask, currentUser, onLogout }) {
  const tabs = navTabs({ hasProject, hasTask })
  return (
    <nav className="nav" aria-label="Main">
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
          {t.label}
        </button>
      ))}
      {currentUser && (
        <div className="nav-user">
          <button
            className={`nav-user-name nav-user-link ${page === 'profile' ? 'active' : ''}`}
            aria-current={page === 'profile' ? 'page' : undefined}
            onClick={() => setPage('profile')}
            title="Your profile"
            aria-label={`Profile of ${currentUser.name}`}
          >
            {firstName(currentUser.name) || 'Profile'}
          </button>
          <button
            className={`nav-user-link ${page === 'settings' || page === 'account' ? 'active' : ''}`}
            aria-current={page === 'settings' || page === 'account' ? 'page' : undefined}
            onClick={() => setPage('settings')}
            title="Preferences, security and sign-in"
          >
            Settings
          </button>
          <button className="btn btn-secondary sm" onClick={onLogout}>Sign out</button>
        </div>
      )}
    </nav>
  )
}

export default Nav
