import { useEffect, useRef, useState } from 'react'
import {
  memberCountLabel, projectState, taskSummary, summaryText,
  greeting, roleIn, projectCounts, filterProjects, searchIsActive, SEARCH_MIN_CHARS
} from '../dashboardLogic'
import { todayISO } from '../boardLogic'
import { firstName } from '../navLogic'
import { avatarColor, initial, memberId } from '../projectLogic'
import './dashboard.css'

const ROLE_TEXT = { owner: 'Owner', admin: 'Admin', contributor: 'Contributor' }
const MAX_AVATARS = 4

const Icon = {
  plus: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>,
  arrow: <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>,
  folder: <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 1.8h4.5A1.5 1.5 0 0114 6.3v5.2a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5z" /></svg>
}

function DashboardPage({
  currentUser, displayName,
  pForm, setPForm, createProject,
  loadProjectId, setLoadProjectId, loadProject, loadingProject,
  selectedProject, boardTasks, statusMeta, goTo,
  myProjects, loadingMyProjects, selectMyProject
}) {
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const nameInput = useRef(null)

  // "Continue" card: closing it is remembered for that project (per browser) and it
  // comes back automatically when a different project is opened.
  const DISMISS_KEY = 'chainboard.resumeDismissed'
  const [dismissedId, setDismissedId] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) || '' } catch { return '' }
  })
  function dismissResume() {
    if (!selectedProject) return
    setDismissedId(selectedProject.projectId)
    try { localStorage.setItem(DISMISS_KEY, selectedProject.projectId) } catch { /* private mode: just this session */ }
  }
  const showResume = !!selectedProject && dismissedId !== selectedProject.projectId

  const email = currentUser ? currentUser.email : ''
  const counts = projectCounts(myProjects, email)
  const shown = filterProjects(myProjects, { query, status })
  const summary = taskSummary(boardTasks, ['todo', 'in-progress', 'done'], todayISO())
  const noProjects = !loadingMyProjects && myProjects.length === 0
  const formOpen = creating || noProjects

  useEffect(() => { if (creating) nameInput.current?.focus() }, [creating])

  const subtitle = loadingMyProjects ? 'Loading your projects…'
    : counts.total === 0 ? 'Create your first project to get started.'
    : `You are working on ${counts.active} active project${counts.active === 1 ? '' : 's'}${counts.archived ? ` (${counts.archived} archived)` : ''}.`

  const filters = [
    { id: 'all', label: 'All', n: counts.total },
    { id: 'active', label: 'Active', n: counts.active },
    { id: 'archived', label: 'Archived', n: counts.archived }
  ]

  return (
    <div className="dash">
      <section className="dash-hero">
        <div>
          <h2 className="dash-hello">{greeting()}{currentUser ? `, ${firstName(currentUser.name)}` : ''}</h2>
          <p className="dash-sub">{subtitle}</p>
        </div>
        {!noProjects && (
          <button type="button" className="btn btn-primary dash-new" aria-expanded={formOpen}
            onClick={() => setCreating(c => !c)}>
            {Icon.plus}{formOpen ? 'Close' : 'New project'}
          </button>
        )}
      </section>

      {formOpen && (
        <section className="card dash-create" aria-label="Create a project">
          <div className="card-header">
            <span className="card-badge project">New</span>
            <h2>Create a project</h2>
          </div>
          <form onSubmit={createProject} className="form dash-create-form">
            <input ref={nameInput} placeholder="Project name" aria-label="Project name" value={pForm.name}
              onChange={e => setPForm({ ...pForm, name: e.target.value })} required />
            <textarea placeholder="What is this project about?" aria-label="Description" value={pForm.description} rows={2}
              onChange={e => setPForm({ ...pForm, description: e.target.value })} required />
            <div className="dash-create-foot">
              <span className="context-line">You become the owner, using your signed-in account. Everything is recorded on the ledger.</span>
              <button type="submit" className="btn btn-primary">Create project</button>
            </div>
          </form>
        </section>
      )}

      {showResume && (
        <section className="card dash-resume" aria-label="Continue where you left off">
          <button type="button" className="dash-close" onClick={dismissResume}
            aria-label="Hide this suggestion" title="Hide">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
          <div className="dash-resume-main">
            <span className="dash-eyebrow">Continue where you left off</span>
            <div className="dash-resume-title">
              <span>{selectedProject.name}</span>
              <span className="state-tag" data-state={projectState(selectedProject)}>{selectedProject.status}</span>
            </div>
            <p className="dash-resume-desc">{selectedProject.description || 'No description'}</p>
            <div className="dash-resume-counts">
              {['todo', 'in-progress', 'done'].map(c => (
                <span key={c} className="dash-count">
                  <span className="dash-count-dot" aria-hidden="true" style={{ background: statusMeta[c].color }} />
                  <b>{summary.counts[c]}</b> {statusMeta[c].label}
                </span>
              ))}
              <span className="dash-count dim">{memberCountLabel(selectedProject.members)}</span>
            </div>
            <div className="progress" role="progressbar" aria-label="Tasks done"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percentDone}>
              <span style={{ width: `${summary.percentDone}%` }} />
            </div>
            <p className="progress-text">{summaryText(summary)}</p>
          </div>
          <div className="dash-resume-actions">
            <button onClick={() => goTo('board')} className="btn btn-accent">Open board →</button>
            <button onClick={() => goTo('project')} className="btn btn-secondary">Manage project</button>
          </div>
        </section>
      )}

      {counts.total > 0 && (
        <div className="dash-stats" role="list" aria-label="Project overview">
          <div className="dash-stat" role="listitem"><b>{counts.total}</b><span>Projects</span></div>
          <div className="dash-stat" role="listitem" data-tone="good"><b>{counts.active}</b><span>Active</span></div>
          <div className="dash-stat" role="listitem"><b>{counts.archived}</b><span>Archived</span></div>
          <div className="dash-stat" role="listitem" data-tone="accent"><b>{counts.owned}</b><span>Owned by you</span></div>
        </div>
      )}

      <section className="card dash-projects" aria-label="Your projects">
        <div className="dash-toolbar">
          <h2 className="dash-title">Your projects</h2>
          {counts.total > 0 && (
            <div className="dash-tools">
              <div className="dash-search-wrap">
                <label className="dash-search">
                  {Icon.search}
                  <input type="search" placeholder={`Search (${SEARCH_MIN_CHARS}+ letters)`} aria-label="Search projects"
                    aria-describedby="dash-search-hint"
                    value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <span id="dash-search-hint" className="dash-search-hint" aria-live="polite">
                  {query.trim() && !searchIsActive(query)
                    ? `Type at least ${SEARCH_MIN_CHARS} letters to search`
                    : ''}
                </span>
              </div>
              <div className="dash-seg" role="group" aria-label="Filter by status">
                {filters.map(f => (
                  <button key={f.id} type="button" className={status === f.id ? 'active' : ''}
                    aria-pressed={status === f.id} onClick={() => setStatus(f.id)}>
                    {f.label} <span className="dash-seg-n">{f.n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {loadingMyProjects ? (
          <div className="dash-grid" aria-busy="true">
            {[0, 1, 2].map(i => <div key={i} className="project-card skeleton" aria-hidden="true" />)}
          </div>
        ) : noProjects ? (
          <div className="dash-empty">
            <span className="dash-empty-icon">{Icon.folder}</span>
            <strong>No projects yet</strong>
            <p>Create one above, or ask a project owner to add you as a member.</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="dash-empty">
            <strong>No projects match</strong>
            <p>Try a different search or filter.</p>
            <button type="button" className="btn btn-secondary sm" onClick={() => { setQuery(''); setStatus('all') }}>Clear filters</button>
          </div>
        ) : (
          <ul className="dash-grid">
            {shown.map(p => {
              const members = Array.isArray(p.members) ? p.members : []
              const ids = members.map(memberId)
              const role = roleIn(p, email)
              return (
                <li key={p.projectId}>
                  <button type="button" className="project-card" data-state={projectState(p)}
                    onClick={() => selectMyProject(p)}
                    aria-label={`Open project ${p.name}, ${projectState(p)}, ${memberCountLabel(p.members)}${role ? `, your role ${role}` : ''}`}>
                    <span className="project-card-top">
                      <span className="project-card-name">{p.name}</span>
                      <span className="state-tag" data-state={projectState(p)}>{p.status}</span>
                    </span>
                    <span className="project-card-desc">{p.description || 'No description'}</span>
                    <span className="project-card-foot">
                      <span className="avatar-stack" aria-hidden="true">
                        {ids.slice(0, MAX_AVATARS).map(id => (
                          <span key={id} className="avatar-chip" title={displayName(id)} style={{ background: avatarColor(id) }}>
                            {initial(displayName(id))}
                          </span>
                        ))}
                        {ids.length > MAX_AVATARS && <span className="avatar-chip more">+{ids.length - MAX_AVATARS}</span>}
                      </span>
                      <span className="project-card-meta">
                        {role && <span className="role-pill" data-role={role}>{ROLE_TEXT[role]}</span>}
                        <span className="project-card-go">{Icon.arrow}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <details className="card dash-byid">
        <summary>Open a project by its ID</summary>
        <p className="context-line">For a project you have not been added to yet, you can look it up read-only.</p>
        <div className="load-row">
          <input placeholder="Project ID" aria-label="Project ID to load" value={loadProjectId}
            onChange={e => setLoadProjectId(e.target.value)} />
          <button onClick={loadProject} className="btn btn-secondary" disabled={loadingProject || !loadProjectId}>
            {loadingProject ? '…' : 'Load'}
          </button>
        </div>
      </details>

    </div>
  )
}

export default DashboardPage
