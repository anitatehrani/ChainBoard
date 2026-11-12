import { useState, useEffect } from 'react'
import {
  cardState, cardAriaLabel, filterTasks, groupByColumn, todayISO,
  UNASSIGNED, activeFilterCount, filterCounts, taskSearchActive, TASK_SEARCH_MIN_CHARS
} from '../boardLogic'
import { canCreateTask } from '../permissionLogic'
import Select from './Select'
import DatePicker from './DatePicker'
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
  const [moreOpen, setMoreOpen] = useState(false)
  // The create-task card is hidden until the person presses "Add new task".
  const [formOpen, setFormOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // App clears the title after a successful create: close the card then.
  useEffect(() => {
    if (submitted && !tForm.title) { setFormOpen(false); setMoreOpen(false); setSubmitted(false) }
  }, [submitted, tForm.title])
  function closeForm() {
    setFormOpen(false); setMoreOpen(false); setSubmitted(false)
    setTForm({ ...tForm, title: '', description: '', dueDate: '' })
  }
  const createCheck = selectedProject ? canCreateTask(selectedProject, currentUser.email) : { allowed: false, reason: '' }
  const [query, setQuery] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriorities, setFilterPriorities] = useState([])
  const [filterDue, setFilterDue] = useState('')

  const today = todayISO()
  const filters = { query, assignee: filterAssignee, priorities: filterPriorities, due: filterDue }
  const filteredTasks = filterTasks(boardTasks, { ...filters, showArchived: showArchivedTasks, today })
  const byColumn = groupByColumn(filteredTasks, columns)
  const activeCount = activeFilterCount(filters)
  const archivedCount = boardTasks.filter(t => t.archived).length
  const baseCount = showArchivedTasks ? boardTasks.length : boardTasks.length - archivedCount
  const counts = filterCounts(boardTasks, today)

  function clearFilters() { setQuery(''); setFilterAssignee(''); setFilterPriorities([]); setFilterDue('') }
  function togglePriority(p) {
    setFilterPriorities(list => (list.includes(p) ? list.filter(x => x !== p) : [...list, p]))
  }
  const toggleDue = d => setFilterDue(cur => (cur === d ? '' : d))

  const members = selectedProject ? selectedProject.members.map(memberId) : []
  const assigneeOptions = [
    { value: '', label: 'Anyone' },
    ...(members.includes(currentUser.email) ? [{ value: currentUser.email, label: 'Assigned to me' }] : []),
    { value: UNASSIGNED, label: 'Unassigned', hint: `${counts.unassigned} open` },
    ...members.filter(id => id !== currentUser.email).map(id => ({ value: id, label: displayName(id), hint: id }))
  ]
  const PRIORITY_CHIPS = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']]
  const DUE_CHIPS = [['overdue', 'Overdue', counts.overdue], ['week', 'Due this week', counts.week], ['none', 'No due date', counts.none]]

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
      {/* Create-task card. Redesigned after the first user test: the old single
          title bar hid priority and due date behind "More options", and the
          participant did not find them. Now every field is visible and labelled. */}
      {formOpen && (
      <section className="card wide newtask" aria-label="Create a task">
        <div className="newtask-head">
          <div className="card-header">
            <span className="card-badge project">New</span>
            <h2>Add a task</h2>
          </div>
          <button type="button" className="newtask-close" aria-label="Close" onClick={closeForm}>×</button>
        </div>
        <form onSubmit={e => { setSubmitted(true); createTask(e) }} className="newtask-form">
          <label className="nt-field">
            <span>Title</span>
            <input className="newtask-title" placeholder="e.g. Print posters" autoFocus
              value={tForm.title} onChange={e => { setSubmitted(false); setTForm({ ...tForm, title: e.target.value }) }}
              disabled={!createCheck.allowed || isArchived} required />
          </label>

          {(createCheck.allowed && !isArchived) && (
            <>
              <div className="newtask-row">
                <div className="nt-field">
                  <span id="nt-priority-label">Priority</span>
                  <div className="nt-seg" role="radiogroup" aria-labelledby="nt-priority-label">
                    {[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([value, label]) => (
                      <button key={value} type="button" role="radio" aria-checked={tForm.priority === value}
                        className={`nt-seg-btn p-${value} ${tForm.priority === value ? 'on' : ''}`}
                        onClick={() => setTForm({ ...tForm, priority: value })}>
                        <span className="nt-dot" aria-hidden="true" />{label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="nt-field">
                  <span>Due date <i>(optional)</i></span>
                  <DatePicker ariaLabel="Due date" value={tForm.dueDate}
                    onChange={v => setTForm({ ...tForm, dueDate: v })} />
                </div>
              </div>

              {moreOpen ? (
                <label className="nt-field">
                  <span>Description <i>(optional)</i></span>
                  <textarea placeholder="Add details, links or acceptance criteria" value={tForm.description} rows={3}
                    onChange={e => setTForm({ ...tForm, description: e.target.value })} autoFocus />
                </label>
              ) : (
                <button type="button" className="newtask-more" onClick={() => setMoreOpen(true)}>
                  + Add a description
                </button>
              )}
            </>
          )}

          <div className="newtask-actions">
            <button type="submit" className="btn btn-primary newtask-go"
              disabled={isArchived || !createCheck.allowed || !tForm.title.trim()}
              title={createCheck.reason}>
              Create task
            </button>
            <button type="button" className="btn btn-secondary newtask-cancel" onClick={closeForm}>Cancel</button>
            {createCheck.allowed && !isArchived && !tForm.title.trim() && (
              <span className="newtask-hint">Enter a title to create the task.</span>
            )}
          </div>
        </form>
      </section>
      )}

      <section className="card wide">
        <div className="board-head">
          <div className="card-header">
            <span className="card-badge project">Board</span>
            <h2>{selectedProject.name || 'Task Board'}</h2>
          </div>
          <div className="board-head-buttons">
          <button type="button" className="btn board-settings" onClick={() => goTo('project')}
            title="Members, roles, history and archiving">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            Project settings
          </button>
          {!formOpen && (
            <div className="board-head-action">
              <button type="button" className="btn newtask-open"
                disabled={isArchived || !createCheck.allowed}
                title={isArchived ? 'This project is archived, so no new tasks can be added.' : createCheck.reason}
                onClick={() => setFormOpen(true)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
                Add new task
              </button>
              {(isArchived || !createCheck.allowed) && (
                <span className="newtask-hint">
                  {isArchived ? 'Archived project: no new tasks.' : createCheck.reason}
                </span>
              )}
            </div>
          )}
          </div>
        </div>
        <p className="board-hint">Tasks are read from the ledger. Drag a card between columns to change its status; select a card to open it.</p>

        <div className="board-tools">

        {boardTasks.length > 0 && (
          <div className="board-filters" role="group" aria-label="Board filters">
            <div className="bf-row">
              <div className="bf-search-wrap">
                <label className="bf-search">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
                  <input type="search" placeholder="Search" aria-label="Search tasks"
                    value={query} onChange={e => setQuery(e.target.value)} />
                </label>
                <span className="bf-hint" aria-live="polite">
                  {query.trim() && !taskSearchActive(query) ? `Type at least ${TASK_SEARCH_MIN_CHARS} letters to search` : ''}
                </span>
              </div>
              <div className="bf-assignee">
                <Select size="sm" ariaLabel="Filter by assignee" value={filterAssignee} onChange={setFilterAssignee}
                  options={assigneeOptions} />
              </div>
              {archivedCount > 0 && (
                <button type="button" className={`bf-chip ${showArchivedTasks ? 'on' : ''}`} aria-pressed={showArchivedTasks}
                  onClick={() => setShowArchivedTasks(v => !v)}>
                  Archived <span className="bf-n">{archivedCount}</span>
                </button>
              )}
            </div>

            <div className="bf-row bf-chips">
              <span className="bf-label">Priority</span>
              {PRIORITY_CHIPS.map(([id, label]) => (
                <button key={id} type="button" className={`bf-chip ${filterPriorities.includes(id) ? 'on' : ''}`}
                  aria-pressed={filterPriorities.includes(id)} onClick={() => togglePriority(id)}>
                  <span className="bf-dot" aria-hidden="true" style={{ background: priorityMeta[id].color }} />{label}
                </button>
              ))}
              <span className="bf-label">Due</span>
              {DUE_CHIPS.map(([id, label, n]) => (
                <button key={id} type="button" className={`bf-chip ${filterDue === id ? 'on' : ''} ${id === 'overdue' && n > 0 ? 'warn' : ''}`}
                  aria-pressed={filterDue === id} onClick={() => toggleDue(id)}>
                  {label} <span className="bf-n">{n}</span>
                </button>
              ))}
              <span className="bf-spacer" />
              <span className="bf-result" role="status" aria-live="polite">
                {activeCount > 0 ? `Showing ${filteredTasks.length} of ${baseCount} tasks` : `${baseCount} task${baseCount === 1 ? '' : 's'}`}
              </span>
              {activeCount > 0 && (
                <button type="button" className="bf-clear" onClick={clearFilters}>Clear all</button>
              )}
            </div>
          </div>
        )}
        </div>

        {loadingBoard ? (
          <div className="context-line">Loading tasks…</div>
        ) : boardTasks.length === 0 ? (
          <div className="context-line">This project has no tasks yet — create the first one above.</div>
        ) : filteredTasks.length === 0 ? (
          <div className="dash-empty">
            <strong>No tasks match these filters</strong>
            <p>Try removing one, or clear them all.</p>
            <button type="button" className="btn btn-secondary sm" onClick={clearFilters}>Clear all filters</button>
          </div>
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
