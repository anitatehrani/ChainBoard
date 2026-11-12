import './shell.css'

// Header shown above every project screen: the project name and two tabs.
// "Board" is the default; "Members and history" is the former project page.
function ProjectHeader({ project, page, goTo, taskCount }) {
  if (!project) return null
  const onBoard = page === 'board' || page === 'task'
  const archived = project.status === 'archived'
  return (
    <div className="ph">
      <div className="ph-title">
        <h1>{project.name}</h1>
        {archived && <span className="ph-badge">Archived</span>}
      </div>
      {project.description && <p className="ph-desc">{project.description}</p>}
      <div className="ph-tabs" role="tablist" aria-label="Project views">
        <button type="button" role="tab" aria-selected={onBoard} className={`ph-tab ${onBoard ? 'on' : ''}`} onClick={() => goTo('board')}>
          Board{typeof taskCount === 'number' && <span className="ph-count">{taskCount}</span>}
        </button>
        <button type="button" role="tab" aria-selected={page === 'project'} className={`ph-tab ${page === 'project' ? 'on' : ''}`} onClick={() => goTo('project')}>
          Members and history
        </button>
      </div>
    </div>
  )
}

export default ProjectHeader
