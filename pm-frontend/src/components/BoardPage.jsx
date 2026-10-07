import { useState } from 'react'
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
      <section className="card wide newtask" aria-label="Create a task">
        <form onSubmit={createTask} className="newtask-form">
          <div className="newtask-main">
            <input className="newtask-title" placeholder="What needs to be done?" aria-label="Task title"
              value={tForm.title} onChange={e => setTForm({ ...tForm, title: e.target.value })}
              disabled={!createCheck.allowed || isArchived} required />
            <button type="submit" className="btn btn-primary newtask-go"
              disabled={isArchived || !createCheck.allowed || !tForm.title.trim()}
              title={createCheck.reason}>
              + Add task
            </button>
          </div>

          {(createCheck.allowed && !isArchived) && (
            <>
              <button type="button" className="newtask-more" aria-expanded={moreOpen}
                onClick={() => setMoreOpen(o => !o)}>
                <span className={`newtask-caret ${moreOpen ? 'open' : ''}`} aria-hidden="true">▸</span>
                {moreOpen ? 'Fewer options' : 'More options'}
                {!moreOpen && (
                  <span className="newtask-summary">
                    {tForm.priority} priority{tForm.dueDate ? ` · due ${tForm.dueDate}` : ''}
                  </span>
                )}
              </button>

              {moreOpen && (
                <div className="newtask-extra">
                  <label className="nt-field nt-wide">
                    <span>Description <i>(optional)</i></span>
                    <textarea placeholder="Add details, links or acceptance criteria" value={tForm.description} rows={3}
                      onChange={e => setTForm({ ...tForm, description: e.target.value })} />
                  </label>
                  <div className="nt-field">
                    <span>Priority</span>
                    <Select ariaLabel="Priority" value={tForm.priority}
                      onChange={v => setTForm({ ...tForm, priority: v })}
                      options={[
                        { value: 'low', label: 'Low priority' },
                        { value: 'medium', label: 'Medium priority' },
                        { value: 'high', label: 'High priority' }
                      ]} />
                  </div>
                  <div className="nt-field">
                    <span>Due date <i>(optional)</i></span>
                    <DatePicker ariaLabel="Due date" value={tForm.dueDate}
                      onChange={v => setTForm({ ...tForm, dueDate: v })} />
                  </div>
                  <label className="nt-field">
                    <span>Task ID <i>(optional)</i></span>
                    <input placeholder="Generated automatically" value={tForm.taskId}
                      onChange={e => setTForm({ ...tForm, taskId: e.target.value })} />
                  </label>
                </div>
              )}
            </>
          )}
        </form>
        {(isArchived || !createCheck.allowed) && (
          <p className="context-line" role="status" style={{ margin: 'var(--s-2) 0 0' }}>
            {isArchived ? 'This project is archived, so no new tasks can be added.' : createCheck.reason}
          </p>
        )}
      </section>

      <section className="card wide">
        <div className="card-header">
          <span className="card-badge project">Board</span>
          <h2>Task Board</h2>
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
