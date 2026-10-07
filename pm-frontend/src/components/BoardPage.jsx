import { useState } from 'react'
import { cardState, cardAriaLabel, filterTasks, groupByColumn, todayISO } from '../boardLogic'
import { canCreateTask } from '../permissionLogic'
import './board.css'

// Old (pre-role) projects stored members as plain ID strings; new ones store
// {id, role}. This tolerates either shape so past data doesn't crash the UI.
function memberId(m) { return typeof m === 'string' ? m : m.id }

function BoardPage({
  currentUser,
  selectedProject, isArchived,
  tForm, setTForm, createTask,
  loadingBoard, boardTasks, statusMeta, priorityMeta, columns,
  displayName, updateStatus,
  showArchivedTasks, setShowArchivedTasks,
  openTask, goTo
}) {
  const [dragOverCol, setDragOverCol] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const today = todayISO()
  const filteredTasks = filterTasks(boardTasks, {
    showArchived: showArchivedTasks, assignee: filterAssignee, priority: filterPriority
  })
  const byColumn = groupByColumn(filteredTasks, columns)
  const filtersActive = filterAssignee || filterPriority
  const archivedCount = boardTasks.filter(t => t.archived).length

  function handleDrop(e, col) {
    e.preventDefault()
    setDragOverCol(null)
    const taskId = e.dataTransfer.getData('text/plain') || draggingId
    setDraggingId(null)
    const task = boardTasks.find(t => t.taskId === taskId)
    if (task && task.status !== col) {
      updateStatus(taskId, col)
    }
  }

  if (!selectedProject) {
    return (
      <section className="card wide">
        <div className="context-line warn">No project loaded yet.</div>
        <button onClick={() => goTo('dashboard')} className="btn btn-primary sm">← Back to Dashboard</button>
      </section>
    )
  }

  return (
    <>
      <section className="card wide">
        <div className="card-header">
          <span className="card-badge task">Task</span>
          <h2>Create Task in {selectedProject.name}</h2>
        </div>
        <form onSubmit={createTask} className="form form-row">
          <input placeholder="Task ID" value={tForm.taskId}
            onChange={e => setTForm({ ...tForm, taskId: e.target.value })} required />
          <input placeholder="Title" value={tForm.title}
            onChange={e => setTForm({ ...tForm, title: e.target.value })} required />
          <textarea placeholder="Description" value={tForm.description} rows={1}
            onChange={e => setTForm({ ...tForm, description: e.target.value })} required />
          <select value={tForm.priority} onChange={e => setTForm({ ...tForm, priority: e.target.value })}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input type="date" title="Due date (optional)" value={tForm.dueDate}
            onChange={e => setTForm({ ...tForm, dueDate: e.target.value })} />
          <button type="submit" className="btn btn-success"
            disabled={isArchived || !canCreateTask(selectedProject, currentUser.email).allowed}
            title={canCreateTask(selectedProject, currentUser.email).reason}>Create Task</button>
        </form>
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge project">Board</span>
          <h2>Task Board</h2>
        </div>
        <p className="board-hint">Tasks are read from the ledger. Drag a card between columns to change its status; select a card to open it.</p>

        <div className="board-tools">

        {boardTasks.length > 0 && (
          <div className="filter-bar" role="group" aria-label="Board filters">
            <select aria-label="Filter by assignee" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option value="">All assignees</option>
              {selectedProject.members.map(m => {
                const id = memberId(m)
                return <option key={id} value={id}>{displayName(id)}</option>
              })}
            </select>
            <select aria-label="Filter by priority" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            {filtersActive && (
              <button className="btn btn-secondary sm" onClick={() => { setFilterAssignee(''); setFilterPriority('') }}>
                Clear filters
              </button>
            )}
            {archivedCount > 0 && (
              <button className="btn btn-secondary sm" onClick={() => setShowArchivedTasks(v => !v)}>
                {showArchivedTasks ? 'Hide' : 'Show'} archived ({archivedCount})
              </button>
            )}
          </div>
        )}
        </div>

        {loadingBoard ? (
          <div className="context-line">Loading tasks…</div>
        ) : boardTasks.length === 0 ? (
          <div className="context-line">This project has no tasks yet — create the first one above.</div>
        ) : filteredTasks.length === 0 ? (
          <div className="context-line">No tasks match the current filters.</div>
        ) : (
          <div className="kanban">
            {columns.map(col => (
              <div
                key={col}
                className={`kanban-col ${dragOverCol === col ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col) }}
                onDragLeave={() => setDragOverCol(prev => (prev === col ? null : prev))}
                onDrop={e => handleDrop(e, col)}
              >
                <div className="kanban-col-header" style={{ color: statusMeta[col].color }}>
                  <span className="kanban-col-title">
                    <span className="kanban-col-dot" aria-hidden="true" />
                    {statusMeta[col].label}
                  </span>
                  <span className="kanban-count" aria-label={`${byColumn[col].length} tasks`}>{byColumn[col].length}</span>
                </div>
                {byColumn[col].length === 0 && (
                  <div className="kanban-empty">{draggingId ? 'Drop here' : 'No tasks'}</div>
                )}
                {byColumn[col].map(t => {
                  const cs = cardState(t, today)
                  return (
                  <div
                    key={t.taskId}
                    className={`kanban-card ${draggingId === t.taskId ? 'dragging' : ''} ${t.archived ? 'archived-card' : ''}`}
                    data-status={t.status}
                    data-state={cs.state}
                    role="button"
                    tabIndex={0}
                    aria-label={cardAriaLabel(t, statusMeta[col].label, today)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openTask(t.taskId); goTo('task')
                      }
                    }}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', t.taskId)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(t.taskId)
                    }}
                    onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                    onClick={() => { openTask(t.taskId); goTo('task') }}
                  >
                    <div className="kanban-card-title">{t.title}</div>
                    <div className="kanban-card-meta">
                      <span className="pill sm priority" style={{ color: priorityMeta[t.priority].color, background: priorityMeta[t.priority].bg }}>
                        {t.priority}
                      </span>
                      {t.archived && <span className="kanban-card-tag">Archived</span>}
                      {t.assigneeId && <span className="pill sm assignee">{displayName(t.assigneeId)}</span>}
                      {cs.dueText && (
                        <span className={`kanban-card-due ${cs.dueSoon ? 'soon' : ''}`}>{cs.dueText}</span>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

export default BoardPage
