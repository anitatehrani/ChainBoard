import { useState, useRef, useEffect } from 'react'
import { cardState, todayISO } from '../boardLogic'
import { isAllowedMove, auditEntries } from '../taskLogic'
import { canWorkOnTask, canAssignTask, canArchiveTask, canComment } from '../permissionLogic'
import { avatarColor, initial } from '../projectLogic'
import { formatWhen } from '../auditLogic'
import AuditVerifier from './AuditVerifier'
import Select from './Select'
import DatePicker from './DatePicker'
import './task.css'
import './taskmodal.css'

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low priority' },
  { value: 'medium', label: 'Medium priority' },
  { value: 'high', label: 'High priority' }
]

const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' }

// Priority as signal bars: 1, 2 or 3 bars filled.
function PriorityIcon({ level }) {
  const n = { low: 1, medium: 2, high: 3 }[level] || 0
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="tm-chip-icon">
      {[0, 1, 2].map(i => (
        <rect key={i} x={2 + i * 4.5} y={10 - i * 3.5} width="3" height={4 + i * 3.5} rx="1"
          fill="currentColor" opacity={i < n ? 1 : 0.25} />
      ))}
    </svg>
  )
}

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
  saveField,
  assignTo, setAssignTo, assignTask,
  uploadFile, setUploadFile, uploadAndAttach, uploading,
  displayName,
  archiveTask,
  newComment, setNewComment, addComment,
  goTo
}) {
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [copied, setCopied] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  // Inline editing: every field is editable in place and saved when you leave it.
  const [titleDraft, setTitleDraft] = useState(selectedTask?.title || '')
  const [descDraft, setDescDraft] = useState(selectedTask?.description || '')
  const [descEditing, setDescEditing] = useState(false)
  const [archiveNote, setArchiveNote] = useState(false)
  const [saving, setSaving] = useState('')   // name of the field being written to the ledger
  // "Why can't I change this?" notice: hidden until you try to change something locked.
  const [notice, setNotice] = useState(false)
  const noticeTimer = useRef(null)
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  function deny(e) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setNotice(false)                                   // re-trigger the animation on repeat clicks
    requestAnimationFrame(() => setNotice(true))
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(false), 7000)
  }

  async function commit(field, value) {
    setSaving(field)
    const ok = await saveField(field, value)
    setSaving('')
    return ok
  }
  async function commitTitle() {
    const v = titleDraft.trim()
    if (!v) { setTitleDraft(selectedTask.title); return }   // a task always needs a title
    if (v !== selectedTask.title && !(await commit('title', v))) setTitleDraft(selectedTask.title)
  }
  const descBusy = useRef(false)   // Save click + blur must not write the same change twice
  async function commitDesc() {
    if (descBusy.current) return
    descBusy.current = true
    try {
      if (descDraft !== (selectedTask.description || '') && !(await commit('description', descDraft))) {
        setDescDraft(selectedTask.description || '')
      }
    } finally { descBusy.current = false }
  }

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
  const canReassign = t.status !== 'done' && !archived && inThisProject

  // Layout: one column. Header = title (click to edit) and the status buttons;
  // a single strip of properties under it; then the content at full width.
  // There is no "Edit" mode: each field is edited in place and saved on its own.
  const canEdit = editable && mayWork.allowed
  // Why this task is locked, shown only after a click on something you can't change.
  // Order matters: archived beats everything, then missing permission, then "done".
  const lock = archived
    ? { tone: 'archived', title: 'This task is archived.', text: 'It is kept for the record and can no longer be changed.' }
    : !mayWork.allowed
      ? { tone: 'perm', title: 'You can’t change this task.',
          text: (mayWork.reason || 'You do not have permission to change it.') +
            (mayAssign.allowed && canReassign ? ' You can still reassign it.' : '') +
            (canComment(selectedProject, currentUser.email).allowed ? ' You can still add comments.' : '') }
      : t.status === 'done'
        ? { tone: 'done', title: 'This task is done.', text: 'To change it, move it back to In Progress or To Do first. Reopening is recorded in its history.' }
        : null
  const locked = !!lock
  // A done task can still be reopened (the chaincode allows done → in-progress / todo),
  // so the status buttons are only locked by archiving or missing permission.
  const statusLocked = archived || !mayWork.allowed
  return (
    <div className="tm-layout" data-status={t.status} style={{ '--st': statusColor?.color }}>
      {/* ── header ── */}
      <header className="tm-head">
        <div className="tm-crumb">
          {selectedProject && inThisProject ? selectedProject.name : 'Task'}
          {archived && <span className="tm-archived">Archived</span>}
          {saving && <span className="tm-saving" role="status">Saving to the ledger…</span>}
        </div>
        {canEdit ? (
          <input className="tm-title tm-title-edit" id="tm-title" aria-label="Task title" value={titleDraft}
            title="Click to edit the title"
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { e.stopPropagation(); setTitleDraft(t.title); e.currentTarget.blur() }
            }} />
        ) : (
          <h2 className={`tm-title ${locked ? 'tm-locked' : ''}`} id="tm-title" onClick={locked ? deny : undefined}>{t.title}</h2>
        )}

        {/* status: the three buttons, as before */}
        <span className="tm-status-title" id="tm-status-title">Status</span>
        <div className="status-buttons tm-statusrow" role="group" aria-labelledby="tm-status-title">
          {columns.map(s => {
            const isCurrent = t.status === s
            const allowed = isAllowedMove(t.status, s) && mayWork.allowed && !archived
            // Locked task: the button stays clickable so the click can explain why.
            const lockedBtn = statusLocked && !isCurrent
            return (
              <button key={s} type="button" data-no-spinner
                onClick={lockedBtn ? deny : (isCurrent ? undefined : async () => { setSaving('status'); try { await updateStatus(t.taskId, s) } finally { setSaving('') } })}
                disabled={!lockedBtn && !allowed}
                aria-disabled={lockedBtn || undefined}
                aria-pressed={isCurrent}
                title={!lockedBtn && !allowed && !isCurrent ? 'That move isn’t allowed from the current status' : undefined}
                className={`status-btn ${isCurrent ? 'active' : ''} ${lockedBtn ? 'is-locked' : ''}`}
                style={isCurrent ? { borderColor: statusMeta[s].color, color: statusMeta[s].color } : undefined}>
                {isCurrent ? '✓ ' : ''}{statusMeta[s].label}
              </button>
            )
          })}
        </div>
      </header>

      {/* ── "why can't I?" notice: appears only after clicking something locked ── */}
      <div aria-live="polite">
        {notice && lock && (
          <div className={`tm-readonly ${lock.tone === 'done' ? 'tm-done' : ''}`} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {lock.tone === 'done' ? <path d="M20 6L9 17l-5-5" /> : <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>}
            </svg>
            <div><strong>{lock.title}</strong> {lock.text}</div>
            <button type="button" className="tm-readonly-x" aria-label="Dismiss" onClick={() => setNotice(false)}>×</button>
          </div>
        )}
      </div>

      {/* ── properties strip ── */}
      <dl className="tm-strip">
        <div className="tm-cell">
          <dt>Priority</dt>
          <dd>
            {canEdit ? (
              <div className="tm-inline-select tm-prio" style={{ '--c': priorityMeta[t.priority].color }}>
                <Select ariaLabel="Priority" value={t.priority}
                  onChange={v => commit('priority', v)} options={PRIORITY_OPTIONS} />
              </div>
            ) : (
              <span className={`tm-chip ${locked ? 'tm-locked' : ''}`} style={{ '--c': priorityMeta[t.priority].color }} onClick={locked ? deny : undefined}>
                <PriorityIcon level={t.priority} />{PRIORITY_LABEL[t.priority] || t.priority}
              </span>
            )}
          </dd>
        </div>
        <div className="tm-cell">
          <dt>Due{canEdit && t.dueDate && <span className={`tm-due-hint ${cs.overdue ? 'overdue' : ''} ${cs.dueSoon ? 'soon' : ''}`}>{cs.dueText}</span>}</dt>
          <dd>
            {canEdit ? (
              <div className="tm-inline-date">
                <DatePicker ariaLabel="Due date" value={t.dueDate || ''}
                  onChange={v => commit('dueDate', v)} />
              </div>
            ) : t.dueDate ? (
              <span className={`tm-due ${cs.overdue ? 'overdue' : ''} ${cs.dueSoon ? 'soon' : ''} ${locked ? 'tm-locked' : ''}`} title={t.dueDate} onClick={locked ? deny : undefined}>
                {cs.dueText}<span className="tm-sub">{t.dueDate}</span>
              </span>
            ) : <span className="t-muted">None</span>}
          </dd>
        </div>
        <div className="tm-cell tm-cell-wide">
          <dt>
            Assignee
            {canReassign && !assignOpen && mayAssign.allowed && (
              <button type="button" className="tm-inline-link" onClick={() => setAssignOpen(true)}>
                {t.assigneeId ? 'Change' : 'Assign'}
              </button>
            )}
          </dt>
          <dd>
            {t.assigneeId ? (
              <span className="t-person"><Avatar id={t.assigneeId} name={displayName(t.assigneeId)} size={22} />{displayName(t.assigneeId)}</span>
            ) : <span className="t-muted">Nobody yet</span>}
          </dd>
        </div>
        <div className="tm-cell">
          <dt>Task ID</dt>
          <dd>
            <button type="button" className="tm-idchip" onClick={copyId} title={`Copy ${t.taskId}`}>
              <span className="mono">{t.taskId}</span>
              <span className="tm-idchip-act">{copied ? '✓' : 'Copy'}</span>
            </button>
          </dd>
        </div>
      </dl>

      {canReassign && assignOpen && (
        <div className="tm-assignbar">
          <span>{t.assigneeId ? 'Reassign to' : 'Assign to'}</span>
          <Select ariaLabel={t.assigneeId ? 'Reassign to' : 'Assign to'}
            placeholder="Choose a person…" value={assignTo} onChange={setAssignTo}
            options={selectedProject.members.map(m => {
              const id = memberId(m)
              return { value: id, label: displayName(id), hint: id }
            })} />
          <button onClick={async () => { await assignTask(); setAssignOpen(false) }} className="btn btn-primary sm"
            disabled={!assignTo || !mayAssign.allowed} title={assignTo ? mayAssign.reason : ''}>Assign</button>
          <button type="button" className="btn btn-secondary sm" onClick={() => { setAssignOpen(false); setAssignTo('') }}>Cancel</button>
        </div>
      )}

      {/* ── content ── */}
      <div className="tm-main">
        <section className="tm-sec" aria-label="Description">
          <h3 className="tm-h">Description</h3>
          {canEdit && descEditing ? (
            <div className="tm-desc-box is-editing">
              <textarea className="tm-desc-edit" aria-label="Description" value={descDraft} autoFocus
                rows={Math.max(3, descDraft.split('\n').length)}
                data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                placeholder="What needs to be done? Add details, links or acceptance criteria."
                onFocus={e => { const n = e.target.value.length; e.target.setSelectionRange(n, n) }}
                onChange={e => setDescDraft(e.target.value)}
                onBlur={async () => { await commitDesc(); setDescEditing(false) }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.stopPropagation(); setDescDraft(t.description || ''); setDescEditing(false) }
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur()
                }} />
              <div className="tm-desc-foot">
                {/* onMouseDown keeps focus in the box so Cancel doesn't save first */}
                <button type="button" className="btn btn-primary sm" onMouseDown={e => e.preventDefault()}
                  onClick={async () => { await commitDesc(); setDescEditing(false) }}>Save</button>
                <button type="button" className="btn btn-secondary sm" onMouseDown={e => e.preventDefault()}
                  onClick={() => { setDescDraft(t.description || ''); setDescEditing(false) }}>Cancel</button>
                <span className="tm-desc-hint">Ctrl + Enter to save · Esc to cancel</span>
              </div>
            </div>
          ) : canEdit ? (
            <button type="button" className={`tm-desc-box tm-desc-view ${t.description ? '' : 'is-empty'}`}
              onClick={() => { setDescDraft(t.description || ''); setDescEditing(true) }}
              aria-label="Edit description">
              {t.description
                ? <span className="tm-desc-text">{t.description}</span>
                : <span className="tm-desc-empty">+ Add a description so others know what this task is about</span>}
              <span className="tm-desc-pen" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                Edit
              </span>
            </button>
          ) : (
            <div className={`tm-desc-box tm-desc-read ${locked ? 'tm-locked' : ''}`} onClick={locked ? deny : undefined}>
              {t.description ? <span className="tm-desc-text">{t.description}</span> : <span className="t-muted">No description</span>}
            </div>
          )}
        </section>

      {/* ── files ── */}
      <section className="tm-sec" aria-label="Files">
        <div className="proj-section-head">
          <div>
            <h3 className="tm-h">Files <span className="members-count">{t.attachments ? t.attachments.length : 0}</span></h3>
            <p className="role-summary">Each file gets a unique fingerprint, so it can never be secretly swapped.</p>
          </div>
        </div>

        <div className={`file-upload ${!mayWork.allowed ? 'tm-locked' : ''}`}
          onClickCapture={!mayWork.allowed ? deny : undefined}>
          <input type="file" onChange={e => setUploadFile(e.target.files[0])} id="fileInput" className="file-input" />
          <label htmlFor="fileInput" className="dropzone">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 11V3M5 6l3-3 3 3M3 13h10" /></svg>
            {uploadFile ? uploadFile.name : 'Choose a file to attach'}
          </label>
          <button onClick={uploadAndAttach} disabled={mayWork.allowed && (!uploadFile || uploading)}
            className="btn btn-primary">
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
      <section className="tm-sec" aria-label="Comments">
        <div className="proj-section-head">
          <h3 className="tm-h">Comments <span className="members-count">{t.comments ? t.comments.length : 0}</span></h3>
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
        <section className="tm-sec" aria-label="Activity">
          <div className="proj-section-head">
            <div>
              <h3 className="tm-h">Activity <span className="members-count">{history.length}</span></h3>
              <p className="role-summary one-line">Saved permanently: past changes can never be edited or deleted.</p>
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
                      <span className="tx-id">Change {e.n}</span>
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
                      {e.value.assigneeId ? <>assigned to <b>{displayName(e.value.assigneeId)}</b></> : 'not assigned'} · <b>{e.value.priority}</b> priority
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
          <div className="tm-archive">
            {!confirmArchive ? (
              <div className="tm-archive-row">
                <button type="button" className={`tm-archive-link ${mayArchive.allowed ? '' : 'is-locked'}`}
                  aria-disabled={!mayArchive.allowed || undefined}
                  title={mayArchive.allowed ? 'It leaves the active board. Its full history is kept.' : undefined}
                  onClick={() => mayArchive.allowed ? setConfirmArchive(true) : setArchiveNote(true)}>
                  Archive task
                </button>
                {archiveNote && !mayArchive.allowed && (
                  <div className="tm-inline-note" role="alert">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                    <span>{mayArchive.reason || 'You do not have permission to archive this task.'}</span>
                    <button type="button" className="tm-readonly-x" aria-label="Dismiss" onClick={() => setArchiveNote(false)}>×</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="tm-confirm" role="alertdialog" aria-label="Confirm archiving">
                <span>Archive this task? It leaves the board; its history is kept. This cannot be undone.</span>
                <div>
                  <button type="button" className="btn btn-secondary sm" onClick={() => setConfirmArchive(false)}>Cancel</button>
                  <button type="button" className="btn btn-danger sm"
                    onClick={async () => { await archiveTask(t.taskId); setConfirmArchive(false) }}>
                    Yes, archive
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>{/* /tm-main */}
    </div>
  )
}

export default TaskPage
