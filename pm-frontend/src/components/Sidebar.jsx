import { useState } from 'react'
import './shell.css'

// Left sidebar of the workspace layout: home, the projects you belong to,
// settings. Switching project is one click from anywhere in the app.
const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const ICON_HOME = <svg {...svg}><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></svg>
const ICON_GEAR = <svg {...svg}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></svg>
const ICON_PLUS = <svg {...svg}><path d="M12 5v14M5 12h14" /></svg>
const ICON_CHAIN = <svg {...svg} strokeWidth="2"><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" /><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></svg>

function Sidebar({ myProjects, loadingMyProjects, selectedProject, selectMyProject, page, goTo }) {
  const [showArchived, setShowArchived] = useState(false)
  const active = myProjects.filter(p => p.status !== 'archived')
  const archived = myProjects.filter(p => p.status === 'archived')
  const inProject = page === 'board' || page === 'project' || page === 'task'
  const currentId = inProject && selectedProject ? selectedProject.projectId : null

  const item = p => (
    <li key={p.projectId}>
      <button type="button" className={`sb-project ${currentId === p.projectId ? 'on' : ''}`}
        aria-current={currentId === p.projectId ? 'page' : undefined}
        onClick={() => selectMyProject(p)} title={p.name}>
        <span className="sb-project-mark" aria-hidden="true">{(p.name || '?').trim().charAt(0).toUpperCase()}</span>
        <span className="sb-project-name">{p.name}</span>
      </button>
    </li>
  )

  return (
    <aside className="sb" aria-label="Workspace">
      <button type="button" className="sb-brand" onClick={() => goTo('dashboard')}>
        <span className="sb-logo">{ICON_CHAIN}</span>
        <span>
          <span className="sb-brand-name">ChainBoard</span>
          <span className="sb-brand-sub">Verifiable project history</span>
        </span>
      </button>

      <nav className="sb-nav" aria-label="Main">
        <button type="button" className={`sb-link ${page === 'dashboard' ? 'on' : ''}`} onClick={() => goTo('dashboard')}>
          {ICON_HOME} Home
        </button>
      </nav>

      <div className="sb-section">
        <span className="sb-label">Your projects</span>
        <button type="button" className="sb-add" onClick={() => goTo('dashboard')} title="Create a project" aria-label="Create a project">{ICON_PLUS}</button>
      </div>
      <ul className="sb-projects">
        {loadingMyProjects && active.length === 0 && <li className="sb-hint">Loading…</li>}
        {!loadingMyProjects && active.length === 0 && <li className="sb-hint">No projects yet</li>}
        {active.map(item)}
      </ul>

      {archived.length > 0 && (
        <>
          <button type="button" className="sb-toggle" aria-expanded={showArchived} onClick={() => setShowArchived(s => !s)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <ul className="sb-projects archived">{archived.map(item)}</ul>}
        </>
      )}

      <div className="sb-foot">
        <button type="button" className={`sb-link ${page === 'settings' || page === 'account' ? 'on' : ''}`} onClick={() => goTo('settings')}>
          {ICON_GEAR} Settings
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
