import { cardState, todayISO } from '../boardLogic'
import { isAllowedMove, auditEntries } from '../taskLogic'
import { canWorkOnTask, canAssignTask, canArchiveTask } from '../permissionLogic'
import AuditVerifier from './AuditVerifier'
import Select from './Select'
import DatePicker from './DatePicker'
import './task.css'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'high', label: 'High priority' }
]

// Old (pre-role) projects stored members as plain ID strings; new ones store
// {id, role}. This tolerates either shape so past data doesn't crash the UI.
function memberId(m) { return typeof m === 'string' ? m : m.id }

function TaskPage({
  currentUser,
  selectedProject, selectedTask, history,
  loadTaskId, setLoadTaskId, loadTaskAndHistory, loadingTask,
  statusMeta, priorityMeta, columns, updateStatus,
  editMeta, setEditMeta, startEditMeta, saveMeta,
  assignTo, setAssignTo, assignTask,
  uploadFile, setUploadFile, uploadAndAttach, uploading,
  displayName,
  archiveTask,
  newComment, setNewComment, addComment,
  goTo
}) {
  const cs = selectedTask ? cardState(selectedTask, todayISO()) : null
  const entries = auditEntries(history, s => statusMeta[s]?.label || s)
  // Mirrors the ledger's rules so buttons explain themselves; the chaincode still decides.
  const inThisProject = !!(selectedProject && selectedTask && selectedProject.projectId === selectedTask.projectId)
  const mayWork = inThisProject ? canWorkOnTask(selectedProject, selectedTask, currentUser.email) : { allowed: true, reason: '' }
  const mayAssign = inThisProject ? canAssignTask(selectedProject, selectedTask, currentUser.email) : { allowed: true, reason: '' }
  const mayArchive = inThisProject ? canArchiveTask(selectedProject, currentUser.email) : { allowed: true, reason: '' }

  return (
    <section className="card wide">
      <div className="card-header">
        <span className="card-badge audit">Ledger</span>
        <h2>Task Viewer &amp; Audit Trail</h2>
      </div>

      <div className="load-row">
        <input placeholder="Task ID" aria-label="Task ID" value={loadTaskId} onChange={e => setLoadTaskId(e.target.value)} />
        <button onClick={loadTaskAndHistory} className="btn btn-accent" disabled={loadingTask}>
          {loadingTask ? 'Loading…' : 'Load Task'}
        </button>
      </div>

      {!selectedTask && (
        <div className="context-line">
          No task selected — load one above, or pick a card from the{' '}
          <button className="link-btn" onClick={() => goTo('board')}>Task Board</button>.
        </div>
      )}

      {selectedTask && (
        <div className="task-detail" data-status={selectedTask.status} data-state={cs.state}>
          {selectedTask.archived && <div className="archived-banner" role="status">This task is archived</div>}

          <div className="task-detail-top">
            {editMeta ? (
              <input className="edit-title-input" aria-label="Title" value={editMeta.title}
                onChange={e => setEditMeta({ ...editMeta, title: e.target.value })} />
            ) : (
              <h3>{selectedTask.title}</h3>
            )}
            <div className="pills">
              <span className="pill" style={{ color: priorityMeta[selectedTask.priority].color, background: priorityMeta[selectedTask.priority].bg }}>
                {selectedTask.priority}
              </span>
              <span className="pill" style={{ color: statusMeta[selectedTask.status].color, background: statusMeta[selectedTask.status].bg }}>
                {statusMeta[selectedTask.status].label}
              </span>
              {selectedTask.assigneeId && (
                <span className="pill assignee">Assigned to {displayName(selectedTask.assigneeId)}</span>
              )}
              {cs.dueText && (
                <span className={`task-due ${cs.overdue ? 'overdue' : ''} ${cs.dueSoon ? 'soon' : ''}`}>
                  {cs.dueText}
                  <span className="task-due-date"> · {selectedTask.dueDate}</span>
                </span>
              )}
            </div>
          </div>

          {editMeta ? (
            <div className="edit-meta-form">
              <textarea rows={2} value={editMeta.description}
                onChange={e => setEditMeta({ ...editMeta, description: e.target.value })} />
              <Select ariaLabel="Priority" value={editMeta.priority}
                onChange={v => setEditMeta({ ...editMeta, priority: v })}
                options={PRIORITY_OPTIONS} />

              <div className="field-label">
                Due date
                <DatePicker ariaLabel="Due date" value={editMeta.dueDate}
                  onChange={v => setEditMeta({ ...editMeta, dueDate: v })} />
              </div>
              <div className="edit-meta-actions">
                <button onClick={saveMeta} className="btn btn-primary sm">Save Changes</button>
                <button onClick={() => setEditMeta(null)} className="btn btn-secondary sm">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <p className="preview-desc">{selectedTask.description}</p>
              {selectedTask.status !== 'done' && !selectedTask.archived && (
                <button onClick={startEditMeta} className="btn btn-secondary sm"
                  disabled={!mayWork.allowed} title={mayWork.reason}>Edit details</button>
              )}
            </>
          )}

          <div className="status-buttons" role="group" aria-label="Status">
            {columns.map(s => {
              const isCurrent = selectedTask.status === s
              const allowed = isAllowedMove(selectedTask.status, s) && mayWork.allowed
              return (
                <button key={s}
                  onClick={() => updateStatus(selectedTask.taskId, s)}
                  disabled={!allowed}
                  aria-pressed={isCurrent}
                  title={!mayWork.allowed ? mayWork.reason : (!allowed ? 'That move isn’t allowed from the current status' : '')}
                  className={`status-btn ${isCurrent ? 'active' : ''}`}>
                  {isCurrent ? '✓ ' : ''}{statusMeta[s].label}
                </button>
              )
            })}
          </div>

          {selectedTask.status !== 'done' && selectedProject && selectedProject.projectId === selectedTask.projectId && (
            <div className="assign-row">
              <Select ariaLabel="Assign to" placeholder="Assign to…" value={assignTo}
                onChange={setAssignTo}
                options={selectedProject.members.map(m => {
                  const id = memberId(m)
                  return { value: id, label: displayName(id), hint: id }
                })} />
              <button onClick={assignTask} className="btn btn-accent sm"
                disabled={!assignTo || !canAssignTask(selectedProject, selectedTask, currentUser.email, assignTo).allowed}
                title={assignTo ? canAssignTask(selectedProject, selectedTask, currentUser.email, assignTo).reason : ''}>Assign</button>
            </div>
          )}

          <div className="file-upload">
            <input type="file" onChange={e => setUploadFile(e.target.files[0])}
              id="fileInput" className="file-input" />
            <label htmlFor="fileInput" className="file-label">
              {uploadFile ? uploadFile.name : 'Choose a file'}
            </label>
            <button onClick={uploadAndAttach} disabled={!uploadFile || uploading || !mayWork.allowed}
              title={mayWork.reason} className="btn btn-primary">
              {uploading ? 'Uploading to IPFS…' : 'Attach to Task'}
            </button>
          </div>

          {selectedTask.attachments && selectedTask.attachments.length > 0 && (
            <div className="attachments">
              <div className="attachments-title">Attached files ({selectedTask.attachments.length})</div>
              {selectedTask.attachments.map((a, i) => (
                <div key={i} className="attachment-item">
                  <span className="attachment-name">{a.fileName}</span>
                  <a href={`http://127.0.0.1:8080/ipfs/${a.cid}`} target="_blank" rel="noreferrer" className="attachment-cid mono">
                    {a.cid.slice(0, 16)}...
                  </a>
                </div>
              ))}
            </div>
          )}

          <div className="comments-block">
            <div className="attachments-title">Comments {selectedTask.comments?.length ? `(${selectedTask.comments.length})` : ''}</div>
            {selectedTask.comments && selectedTask.comments.length > 0 && (
              <div className="comment-list">
                {selectedTask.comments.map((c, i) => (
                  <div key={i} className="comment-item">
                    <span className="comment-author">{displayName(c.authorId)}</span>
                    <span className="comment-text">{c.text}</span>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={addComment} className="comment-form">
              <input placeholder="Add a comment…" aria-label="Add a comment" value={newComment.text} style={{ flex: 1 }}
                onChange={e => setNewComment({ ...newComment, text: e.target.value })} />
              <button type="submit" className="btn btn-secondary sm">Post</button>
            </form>
          </div>

          {!selectedTask.archived && (
            <button onClick={() => archiveTask(selectedTask.taskId)} className="btn btn-danger sm archive-task-btn"
              disabled={!mayArchive.allowed} title={mayArchive.reason}>
              Archive task
            </button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="timeline">
          <div className="timeline-header">
            <span className="lock-icon" aria-hidden="true">🔒</span>
            Immutable audit trail — {history.length} on-chain record{history.length > 1 ? 's' : ''}
          </div>
          <AuditVerifier kind="task" id={selectedTask ? selectedTask.taskId : history[0]?.value?.taskId} key={selectedTask ? selectedTask.taskId : 'none'} />
          <ol className="timeline-list" aria-label="Audit trail, newest first">
          {entries.map(e => (
            <li key={e.txId || e.n} className="timeline-item">
              <div className="timeline-dot" aria-hidden="true" style={{ background: statusMeta[e.value.status]?.color }} />
              <div className="timeline-content">
                <div className="timeline-row">
                  <span className="mono tx-id">tx #{e.n}</span>
                  {statusMeta[e.value.status] && (
                    <span className="pill sm" style={{ color: statusMeta[e.value.status].color, background: statusMeta[e.value.status].bg }}>
                      {statusMeta[e.value.status].label}
                    </span>
                  )}
                </div>
                <div className="timeline-change">{e.changes.join(' · ')}</div>
                <div className="timeline-meta">
                  assignee <b>{e.value.assigneeId ? displayName(e.value.assigneeId) : '—'}</b> · priority <b>{e.value.priority}</b>
                </div>
              </div>
            </li>
          ))}
          </ol>
        </div>
      )}
    </section>
  )
}

export default TaskPage
