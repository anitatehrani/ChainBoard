import { useState } from 'react'
import { cardState, todayISO } from '../boardLogic'
import { isAllowedMove, auditEntries } from '../taskLogic'
import { canWorkOnTask, canAssignTask, canArchiveTask } from '../permissionLogic'
import { avatarColor, initial } from '../projectLogic'
import { formatWhen } from '../auditLogic'
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

function Avatar({ id, name, size = 28 }) {
  return (
    <span className="t-avatar" aria-hidden="true"
      style={{ background: avatarColor(id), width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {initial(name)}
    </span>
  )
}

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
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [copied, setCopied] = useState(false)

  const cs = selectedTask ? cardState(selectedTask, todayISO()) : null
  const entries = auditEntries(history, s => statusMeta[s]?.label || s)
  // Mirrors the ledger's rules so buttons explain themselves; the chaincode still decides.
  const inThisProject = !!(selectedProject && selectedTask && selectedProject.projectId === selectedTask.projectId)
  const mayWork = inThisProject ? canWorkOnTask(selectedProject, selectedTask, currentUser.email) : { allowed: true, reason: '' }
  const mayAssign = inThisProject ? canAssignTask(selectedProject, selectedTask, currentUser.email, assignTo || undefined) : { allowed: true, reason: '' }
  const mayArchive = inThisProject ? canArchiveTask(selectedProject, currentUser.email) : { allowed: true, reason: '' }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(selectedTask.taskId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable: the id is still visible to copy by hand */ }
  }

  const loadById = (
    <details className="card t-byid">
      <summary>Open a task by its ID</summary>
      <div className="load-row">
        <input placeholder="Task ID" aria-label="Task ID" value={loadTaskId} onChange={e => setLoadTaskId(e.target.value)} />
        <button onClick={loadTaskAndHistory} className="btn btn-secondary" disabled={loadingTask || !loadTaskId}>
          {loadingTask ? 'Loading…' : 'Load task'}
        </button>
      </div>
    </details>
  )

  if (!selectedTask) {
    return (
      <div className="tp">
        <section className="card t-empty">
          <strong>No task selected</strong>
          <p>Pick a card on the board to open it here.</p>
          <button className="btn btn-primary" onClick={() => goTo('board')}>Go to the board</button>
        </section>
        <section className="card">
          <div className="load-row">
            <input placeholder="Or type a task ID" aria-label="Task ID" value={loadTaskId} onChange={e => setLoadTaskId(e.target.value)} />
            <button onClick={loadTaskAndHistory} className="btn btn-accent" disabled={loadingTask || !loadTaskId}>
              {loadingTask ? 'Loading…' : 'Load task'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  const t = selectedTask
  const archived = !!t.archived
  const editable = t.status !== 'done' && !archived
  const statusColor = statusMeta[t.status]

  return (
    <div className="tp">
      <button type="button" className="btn-link" onClick={() => goTo('board')}>
        ← Board{selectedProject && inThisProject ? ` · ${selectedProject.name}` : ''}
      </button>

      {/* ── header: title, status, key facts, description ── */}
      <section className="card t-hero" data-status={t.status} data-state={cs.state}>
        {archived && <div className="archived-banner" role="status">This task is archived</div>}

        <div className="t-hero-top">
          {editMeta ? (
            <input className="edit-title-input" aria-label="Title" value={editMeta.title}
              onChange={e => setEditMeta({ ...editMeta, title: e.target.value })} />
          ) : (
            <h2 className="t-title">{t.title}</h2>
          )}
          {!editMeta && editable && (
            <button onClick={startEditMeta} className="btn btn-secondary sm"
              disabled={!mayWork.allowed} title={mayWork.reason}>Edit details</button>
          )}
        </div>

        <div className="status-buttons" role="group" aria-label="Status">
          {columns.map(s => {
            const isCurrent = t.status === s
            const allowed = isAllowedMove(t.status, s) && mayWork.allowed
            return (
              <button key={s} type="button"
                onClick={() => updateStatus(t.taskId, s)}
                disabled={!allowed}
                aria-pressed={isCurrent}
                title={!mayWork.allowed ? mayWork.reason : (!allowed ? 'That move isn’t allowed from the current status' : '')}
                className={`status-btn ${isCurrent ? 'active' : ''}`}
                style={isCurrent ? { borderColor: statusMeta[s].color, color: statusMeta[s].color } : undefined}>
                {isCurrent ? '✓ ' : ''}{statusMeta[s].label}
              </button>
            )
          })}
        </div>

        {editMeta ? (
          <div className="t-edit">
            <label className="nt-field nt-wide">
              <span>Description</span>
              <textarea rows={4} value={editMeta.description}
                onChange={e => setEditMeta({ ...editMeta, description: e.target.value })} />
            </label>
            <div className="nt-field">
              <span>Priority</span>
              <Select ariaLabel="Priority" value={editMeta.priority}
                onChange={v => setEditMeta({ ...editMeta, priority: v })} options={PRIORITY_OPTIONS} />
            </div>
            <div className="nt-field">
              <span>Due date</span>
              <DatePicker ariaLabel="Due date" value={editMeta.dueDate}
                onChange={v => setEditMeta({ ...editMeta, dueDate: v })} />
            </div>
            <div className="edit-meta-actions nt-wide">
              <button onClick={saveMeta} className="btn btn-primary sm" disabled={!editMeta.title.trim()}>Save changes</button>
              <button onClick={() => setEditMeta(null)} className="btn btn-secondary sm">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="t-desc">{t.description || <span className="t-muted">No description</span>}</p>
            <dl className="t-facts">
              <div>
                <dt>Priority</dt>
                <dd><span className="pill" style={{ color: priorityMeta[t.priority].color, background: priorityMeta[t.priority].bg }}>{t.priority}</span></dd>
              </div>
              <div>
                <dt>Due</dt>
                <dd>
                  {t.dueDate ? (
                    <span className={`task-due ${cs.overdue ? 'overdue' : ''} ${cs.dueSoon ? 'soon' : ''}`}>
                      {cs.dueText}<span className="task-due-date"> · {t.dueDate}</span>
                    </span>
                  ) : <span className="t-muted">No due date</span>}
                </dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>
                  {t.assigneeId ? (
                    <span className="t-person"><Avatar id={t.assigneeId} name={displayName(t.assigneeId)} size={22} />{displayName(t.assigneeId)}</span>
                  ) : <span className="t-muted">Unassigned</span>}
                </dd>
              </div>
              <div>
                <dt>Task ID</dt>
                <dd>
                  <span className="mono t-id">{t.taskId}</span>
                  <button type="button" className="chip-copy" onClick={copyId} aria-label="Copy task ID">{copied ? 'Copied' : 'Copy'}</button>
                </dd>
              </div>
            </dl>
          </>
        )}

        {t.status !== 'done' && inThisProject && (
          <div className="t-assign">
            <span className="t-assign-label">{t.assigneeId ? 'Reassign to' : 'Assign to'}</span>
            <div className="assign-row">
              <Select ariaLabel="Assign to" placeholder="Choose a person…" value={assignTo}
                onChange={setAssignTo}
                options={selectedProject.members.map(m => {
                  const id = memberId(m)
                  return { value: id, label: displayName(id), hint: id }
                })} />
              <button onClick={assignTask} className="btn btn-accent sm"
                disabled={!assignTo || !mayAssign.allowed}
                title={assignTo ? mayAssign.reason : ''}>Assign</button>
            </div>
          </div>
        )}
      </section>

      {/* ── files ── */}
      <section className="card" aria-label="Files">
        <div className="proj-section-head">
          <div>
            <h3 className="proj-h3">Files <span className="members-count">{t.attachments ? t.attachments.length : 0}</span></h3>
            <p className="role-summary">Stored on IPFS; the ledger keeps only each file’s content ID.</p>
          </div>
        </div>

        <div className="file-upload">
          <input type="file" onChange={e => setUploadFile(e.target.files[0])} id="fileInput" className="file-input" />
          <label htmlFor="fileInput" className="dropzone">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 11V3M5 6l3-3 3 3M3 13h10" /></svg>
            {uploadFile ? uploadFile.name : 'Choose a file to attach'}
          </label>
          <button onClick={uploadAndAttach} disabled={!uploadFile || uploading || !mayWork.allowed}
            title={mayWork.reason} className="btn btn-primary">
            {uploading ? 'Uploading to IPFS…' : 'Attach'}
          </button>
        </div>

        {t.attachments && t.attachments.length > 0 && (
          <ul className="t-files">
            {t.attachments.map((a, i) => (
              <li key={i} className="attachment-item">
                <span className="attachment-name">{a.fileName}</span>
                <a href={`http://127.0.0.1:8080/ipfs/${a.cid}`} target="_blank" rel="noreferrer" className="attachment-cid mono">
                  {a.cid.slice(0, 16)}…
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── discussion ── */}
      <section className="card" aria-label="Comments">
        <div className="proj-section-head">
          <h3 className="proj-h3">Comments <span className="members-count">{t.comments ? t.comments.length : 0}</span></h3>
        </div>
        {t.comments && t.comments.length > 0 ? (
          <ul className="t-comments">
            {t.comments.map((c, i) => (
              <li key={i} className="t-comment">
                <Avatar id={c.authorId} name={displayName(c.authorId)} />
                <div className="t-comment-body">
                  <span className="comment-author">{displayName(c.authorId)}</span>
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-muted" style={{ margin: '0 0 var(--s-3)' }}>No comments yet. Start the conversation.</p>
        )}
        <form onSubmit={addComment} className="comment-form">
          <Avatar id={currentUser.email} name={currentUser.name} />
          <input placeholder="Write a comment…" aria-label="Add a comment" value={newComment.text}
            onChange={e => setNewComment({ ...newComment, text: e.target.value })} />
          <button type="submit" className="btn btn-primary sm" disabled={!newComment.text.trim()}>Post</button>
        </form>
      </section>

      {/* ── activity ── */}
      {history.length > 0 && (
        <section className="card" aria-label="Activity">
          <div className="proj-section-head">
            <div>
              <h3 className="proj-h3">Activity <span className="members-count">{history.length}</span></h3>
              <p className="role-summary">Every change is an immutable on-chain record.</p>
            </div>
          </div>
          <AuditVerifier kind="task" id={t.taskId} key={t.taskId} />
          <div className="timeline compact">
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
                      {e.value.updatedBy && <>by <b>{displayName(e.value.updatedBy)}</b> · </>}
                      {formatWhen(e.timestamp) && <>{formatWhen(e.timestamp)} · </>}
                      assignee <b>{e.value.assigneeId ? displayName(e.value.assigneeId) : '—'}</b> · priority <b>{e.value.priority}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── archive ── */}
      {!archived && (
        <section className="card proj-danger" aria-label="Archive task">
          <div className="proj-section-head">
            <div>
              <h3 className="proj-h3">Archive this task</h3>
              <p className="role-summary">
                {mayArchive.allowed
                  ? 'It leaves the active board. Its full history stays on the ledger.'
                  : mayArchive.reason}
              </p>
            </div>
            {!confirmArchive ? (
              <button type="button" className="btn btn-danger sm" disabled={!mayArchive.allowed}
                title={mayArchive.reason} onClick={() => setConfirmArchive(true)}>
                Archive task
              </button>
            ) : (
              <div className="proj-confirm" role="alertdialog" aria-label="Confirm archiving">
                <span>Archive “{t.title}”? This cannot be undone.</span>
                <button type="button" className="btn btn-secondary sm" onClick={() => setConfirmArchive(false)}>Cancel</button>
                <button type="button" className="btn btn-danger sm"
                  onClick={async () => { await archiveTask(t.taskId); setConfirmArchive(false) }}>
                  Yes, archive
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {loadById}
    </div>
  )
}

export default TaskPage
