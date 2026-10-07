import { memberCountLabel, projectState, taskSummary, summaryText } from '../dashboardLogic'
import { todayISO } from '../boardLogic'
import './dashboard.css'

function DashboardPage({
  pForm, setPForm, createProject,
  loadProjectId, setLoadProjectId, loadProject, loadingProject,
  selectedProject, boardTasks, statusMeta, goTo,
  myProjects, loadingMyProjects, selectMyProject
}) {
  const summary = taskSummary(boardTasks, ['todo', 'in-progress', 'done'], todayISO())
  return (
    <div className="grid-2">
      <section className="card">
        <div className="card-header">
          <span className="card-badge project">Project</span>
          <h2>Create Project</h2>
        </div>
        <form onSubmit={createProject} className="form">
          <input placeholder="Name" value={pForm.name}
            onChange={e => setPForm({ ...pForm, name: e.target.value })} required />
          <textarea placeholder="Description" value={pForm.description} rows={2}
            onChange={e => setPForm({ ...pForm, description: e.target.value })} required />
          <p className="context-line" style={{ margin: '-2px 0 2px' }}>
            You'll automatically be added as the owner (using your logged-in account).
          </p>
          <button type="submit" className="btn btn-primary">Create Project</button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <span className="card-badge audit">Your Projects</span>
          <h2>Open Existing Project</h2>
        </div>

        {loadingMyProjects ? (
          <p className="context-line">Loading your projects…</p>
        ) : myProjects.length === 0 ? (
          <div className="dash-empty">You don't own or belong to any projects yet — create one, or ask an owner to add you as a member.</div>
        ) : (
          <ul className="project-list">
            {myProjects.map(p => (
              <li key={p.projectId}>
                <button type="button" className="project-row" data-state={projectState(p)}
                  onClick={() => selectMyProject(p)}
                  aria-label={`Open project ${p.name}, ${projectState(p)}, ${memberCountLabel(p.members)}`}>
                  <span className="project-row-main">
                    <span className="project-row-name">{p.name}</span>
                    <span className="project-row-sub mono">ID {p.projectId} · {memberCountLabel(p.members)}</span>
                  </span>
                  <span className="state-tag" data-state={projectState(p)}>{p.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="divider" style={{ margin: '10px 0' }} />
        <p className="context-line">Or load any project by ID:</p>
        <div className="load-row">
          <input placeholder="Project ID to load" aria-label="Project ID to load" value={loadProjectId}
            onChange={e => setLoadProjectId(e.target.value)} />
          <button onClick={loadProject} className="btn btn-secondary" disabled={loadingProject}>
            {loadingProject ? '…' : 'Load'}
          </button>
        </div>

        {selectedProject && (
          <div className="preview-card">
            <div className="preview-title">{selectedProject.name}</div>
            <p className="preview-desc">{selectedProject.description}</p>
            <div className="dash-row">
              <span className="state-tag" data-state={projectState(selectedProject)}>{selectedProject.status}</span>
              <span className="context-line" style={{ margin: 0 }}>{memberCountLabel(selectedProject.members)}</span>
            </div>
            <div className="stat-grid">
              {['todo', 'in-progress', 'done'].map(c => (
                <div key={c} className="stat-card" data-col={c}>
                  <div className="stat-value" style={{ color: statusMeta[c].color }}>
                    {summary.counts[c]}
                  </div>
                  <div className="stat-label">{statusMeta[c].label}</div>
                </div>
              ))}
            </div>
            <div className="progress" role="progressbar" aria-label="Tasks done"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percentDone}>
              <span style={{ width: `${summary.percentDone}%` }} />
            </div>
            <p className="progress-text">
              {summaryText(summary)}
            </p>
            <div className="quick-links">
              <button onClick={() => goTo('project')} className="btn btn-secondary sm">Manage Project →</button>
              <button onClick={() => goTo('board')} className="btn btn-accent sm">Open Board →</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default DashboardPage
