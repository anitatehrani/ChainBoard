import { useState } from 'react'
import {
  memberId, memberRole, avatarColor, initial, sortMembers, roleSummary, roleHelp, projectAuditEntries
} from '../projectLogic'
import { canAddMember, canArchiveProject, roleLabel } from '../permissionLogic'
import { taskSummary, summaryText } from '../dashboardLogic'
import { todayISO } from '../boardLogic'
import { formatWhen } from '../auditLogic'
import AuditVerifier from './AuditVerifier'
import Select from './Select'
import './project.css'

const ROLE_TEXT = { owner: 'Owner', admin: 'Admin', contributor: 'Contributor' }

// One person in the list. The nickname field only appears when asked for, so the
// list reads as people and roles first.
function MemberRow({ id, role, name, nickname, setDisplayName }) {
  const [editing, setEditing] = useState(false)
  const showId = name !== id
  return (
    <li className="member-row" title={role ? roleHelp(role) : id}>
      <div className="member-avatar" aria-hidden="true" style={{ background: avatarColor(id) }}>{initial(name)}</div>
      <div className="member-main">
        <div className="member-name-line">
          <span className="member-display-name">{name}</span>
          {role && <span className={`pill sm role-${role}`}>{ROLE_TEXT[role] || role}</span>}
        </div>
        {showId && <div className="member-sub">{id}</div>}
      </div>
      {editing ? (
        <input
          className="member-name-input"
          aria-label={`Nickname for ${name}`}
          placeholder="Nickname (only you see it)"
          defaultValue={nickname}
          autoFocus
          onBlur={e => { setDisplayName(id, e.target.value.trim()); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(false) }}
        />
      ) : (
        <button type="button" className="member-edit" onClick={() => setEditing(true)}
          aria-label={`Set a nickname for ${name}`} title="Set a nickname">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5z" /></svg>
        </button>
      )}
    </li>
  )
}

function ProjectPage({
  currentUser,
  selectedProject, isArchived, archiveProject,
  newMember, setNewMember, newMemberRole, setNewMemberRole, addMember,
  loadProjectHistory, loadingProjHistory, showProjectHistory, projectHistory,
  nameMap, displayName, setDisplayName,
  userDirectory, boardTasks = [], statusMeta,
  goTo
}) {
  const [adding, setAdding] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [copied, setCopied] = useState(false)

  // Only offer registered accounts that aren't already members — picking a
  // name from this list is how the ID actually gets sent, so nobody has to
  // type or see a raw email address to add someone to a project.
  const existingIds = new Set(selectedProject ? selectedProject.members.map(memberId) : [])
  const availableUsers = userDirectory.filter(u => !existingIds.has(u.email))
  if (!selectedProject) {
    return (
      <section className="card wide">
        <div className="context-line warn">No project loaded yet.</div>
        <button onClick={() => goTo('dashboard')} className="btn btn-primary sm">← Back to Dashboard</button>
      </section>
    )
  }

  const myRole = (selectedProject.members.map(m => ({ id: memberId(m), role: memberRole(m) }))
    .find(m => m.id === currentUser.email) || {}).role
  const roles = roleSummary(selectedProject.members)
  const summary = taskSummary(boardTasks, ['todo', 'in-progress', 'done'], todayISO())
  const addCheck = canAddMember(selectedProject, currentUser.email, newMemberRole)
  const archiveCheck = canArchiveProject(selectedProject, currentUser.email)

  async function copyId() {
    try {
      await navigator.clipboard.writeText(selectedProject.projectId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable: the id is still visible to copy by hand */ }
  }

  return (
    <div className="proj">
      <button type="button" className="back-link btn-link" onClick={() => goTo('dashboard')}>← All projects</button>

      <section className="card proj-hero">
        <div className="proj-hero-top">
          <div className="proj-hero-title">
            <h2>{selectedProject.name}</h2>
            <span className="state-tag" data-state={isArchived ? 'archived' : 'active'}>{selectedProject.status}</span>
            {myRole && <span className={`pill sm role-${myRole}`} title={roleLabel(selectedProject, currentUser.email)}>Your role: {ROLE_TEXT[myRole] || myRole}</span>}
          </div>
          <button type="button" className="btn btn-accent" onClick={() => goTo('board')}>Open board →</button>
        </div>

        {isArchived && <div className="archived-banner" role="status">This project is archived — read-only</div>}

        <p className="proj-desc">{selectedProject.description || 'No description'}</p>

        <div className="proj-facts">
          <span className="meta-chip">Owner <b>{displayName(selectedProject.ownerId)}</b></span>
          <span className="meta-chip">{selectedProject.members.length} member{selectedProject.members.length === 1 ? '' : 's'}</span>
          <span className="meta-chip">ID <b className="mono">{selectedProject.projectId}</b>
            <button type="button" className="chip-copy" onClick={copyId} aria-label="Copy project ID">{copied ? 'Copied' : 'Copy'}</button>
          </span>
        </div>

        {statusMeta && (
          <div className="proj-progress">
            <div className="proj-counts">
              {['todo', 'in-progress', 'done'].map(c => (
                <span key={c} className="dash-count">
                  <span className="dash-count-dot" aria-hidden="true" style={{ background: statusMeta[c].color }} />
                  <b>{summary.counts[c]}</b> {statusMeta[c].label}
                </span>
              ))}
            </div>
            <div className="progress" role="progressbar" aria-label="Tasks done"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percentDone}>
              <span style={{ width: `${summary.percentDone}%` }} />
            </div>
            <p className="progress-text">{summaryText(summary)}</p>
          </div>
        )}
      </section>

      <section className="card" aria-label="Members">
        <div className="proj-section-head">
          <div>
            <h3 className="proj-h3">Members <span className="members-count">{selectedProject.members.length}</span></h3>
            <p className="role-summary">{roles.owner} owner · {roles.admin} admin · {roles.contributor} contributor</p>
          </div>
          {!isArchived && (
            <button type="button" className="btn btn-secondary sm" aria-expanded={adding}
              onClick={() => setAdding(a => !a)}>
              {adding ? 'Close' : '+ Add member'}
            </button>
          )}
        </div>

        {adding && !isArchived && (
          <div className="add-member-box">
            <form onSubmit={e => { addMember(e); }} className="inline-form">
              <label className="field-label-inline">
                Person
                <Select ariaLabel="Person to add" placeholder="Choose a person…" searchable
                  value={newMember} onChange={setNewMember}
                  options={availableUsers.map(u => ({
                    value: u.email, label: u.name, hint: u.username ? `@${u.username}` : u.email
                  }))} />
              </label>
              <label className="field-label-inline role-field">
                Role
                <Select ariaLabel="Role" value={newMemberRole} onChange={setNewMemberRole}
                  options={[
                    { value: 'contributor', label: 'Contributor', hint: 'Works on tasks' },
                    { value: 'admin', label: 'Admin', hint: 'Manages tasks and contributors' },
                    { value: 'owner', label: 'Owner', hint: 'Full control' }
                  ]} />
              </label>
              <button type="submit" className="btn btn-primary sm"
                disabled={!newMember || !addCheck.allowed}>
                Add member
              </button>
            </form>
            {!addCheck.allowed && (
              <p className="context-line" role="status" style={{ marginTop: 8 }}>{addCheck.reason}</p>
            )}
            {availableUsers.length === 0 && (
              <p className="context-line" style={{ marginTop: 8 }}>
                Everyone with an account is already a member of this project.
              </p>
            )}
          </div>
        )}

        <ul className="member-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sortMembers(selectedProject.members).map(m => {
            const id = memberId(m)
            return (
              <MemberRow key={id} id={id} role={memberRole(m)} name={displayName(id)}
                nickname={nameMap[id] || ''} setDisplayName={setDisplayName} />
            )
          })}
        </ul>
      </section>

      <section className="card" aria-label="History and verification">
        <div className="proj-section-head">
          <div>
            <h3 className="proj-h3">History &amp; verification</h3>
            <p className="role-summary">Every change to this project is a blockchain transaction.</p>
          </div>
          <button onClick={loadProjectHistory} className="btn btn-secondary sm" disabled={loadingProjHistory}>
            {loadingProjHistory ? '…' : (showProjectHistory ? 'Refresh history' : 'View history')}
          </button>
        </div>

        <AuditVerifier kind="project" id={selectedProject.projectId} key={selectedProject.projectId} />

        {showProjectHistory && projectHistory.length > 0 && (
          <div className="timeline compact">
            <ol className="timeline-list" aria-label="Project history, newest first">
              {projectAuditEntries(projectHistory, id => displayName(id)).map(e => (
                <li key={e.txId || e.n} className="timeline-item">
                  <div className="timeline-dot" aria-hidden="true" style={{ background: e.value.status === 'archived' ? 'var(--text-dim)' : 'var(--success)' }} />
                  <div className="timeline-content">
                    <div className="timeline-row">
                      <span className="mono tx-id">tx #{e.n}</span>
                      <span className="state-tag" data-state={e.value.status === 'archived' ? 'archived' : 'active'}>
                        {e.value.status}
                      </span>
                    </div>
                    <div className="timeline-change">{e.changes.join(' · ')}</div>
                    <div className="timeline-meta">
                      {e.value.updatedBy && <>by <b>{displayName(e.value.updatedBy)}</b> · </>}
                      {formatWhen(e.timestamp) && <>{formatWhen(e.timestamp)} · </>}
                      members <b>{e.value.members.map(m => displayName(memberId(m))).join(', ')}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {!isArchived && (
        <section className="card proj-danger" aria-label="Archive project">
          <div className="proj-section-head">
            <div>
              <h3 className="proj-h3">Archive this project</h3>
              <p className="role-summary">
                {archiveCheck.allowed
                  ? 'The project becomes read-only for everyone. Its history stays on the ledger and cannot be removed.'
                  : archiveCheck.reason}
              </p>
            </div>
            {!confirmArchive ? (
              <button type="button" className="btn btn-danger sm" disabled={!archiveCheck.allowed}
                title={archiveCheck.reason} onClick={() => setConfirmArchive(true)}>
                Archive project
              </button>
            ) : (
              <div className="proj-confirm" role="alertdialog" aria-label="Confirm archiving">
                <span>Archive “{selectedProject.name}”? This cannot be undone.</span>
                <button type="button" className="btn btn-secondary sm" onClick={() => setConfirmArchive(false)}>Cancel</button>
                <button type="button" className="btn btn-danger sm" onClick={async () => { await archiveProject(); setConfirmArchive(false) }}>
                  Yes, archive
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

export default ProjectPage
