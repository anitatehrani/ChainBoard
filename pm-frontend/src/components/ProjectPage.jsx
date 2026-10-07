import {
  memberId, memberRole, avatarColor, initial, sortMembers, roleSummary, roleHelp, projectAuditEntries
} from '../projectLogic'
import { canAddMember, canArchiveProject, roleLabel } from '../permissionLogic'
import AuditVerifier from './AuditVerifier'
import Select from './Select'
import './project.css'

function ProjectPage({
  currentUser,
  selectedProject, isArchived, archiveProject,
  newMember, setNewMember, newMemberRole, setNewMemberRole, addMember,
  loadProjectHistory, loadingProjHistory, showProjectHistory, projectHistory,
  nameMap, displayName, setDisplayName,
  userDirectory,
  goTo
}) {
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

  return (
    <section className="card wide">
      <div className="card-header">
        <span className="card-badge project">Project</span>
        <h2>{selectedProject.name}</h2>
      </div>

      {isArchived && <div className="archived-banner" role="status">This project is archived — read-only</div>}

      <p className="preview-desc">{selectedProject.description}</p>
      <div className="preview-meta-chips">
        <span className="meta-chip">Owner <b>{displayName(selectedProject.ownerId)}</b></span>
        <span className="meta-chip">Project ID <b className="mono">{selectedProject.projectId}</b></span>
      </div>

      <div className="project-head">
        <span className="state-tag" data-state={isArchived ? 'archived' : 'active'}>
          {selectedProject.status}
        </span>
        <span className="role-note">{roleLabel(selectedProject, currentUser.email)}</span>
        <button onClick={archiveProject} className="btn btn-danger sm"
          disabled={!canArchiveProject(selectedProject, currentUser.email).allowed}
          title={canArchiveProject(selectedProject, currentUser.email).reason}>
          Archive Project
        </button>
      </div>

      <div className="divider" />

      <div className="members-block">
        <div className="members-title">Members <span className="members-count">{selectedProject.members.length}</span></div>
        {(() => {
          const r = roleSummary(selectedProject.members)
          return <p className="role-summary">{r.owner} owner · {r.admin} admin · {r.contributor} contributor</p>
        })()}
        <ul className="member-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sortMembers(selectedProject.members).map(m => {
            const id = memberId(m)
            const role = memberRole(m)
            const name = displayName(id)
            return (
              <li key={id} className="member-row" title={role ? roleHelp(role) : id}>
                <div className="member-avatar" aria-hidden="true" style={{ background: avatarColor(id) }}>
                  {initial(name)}
                </div>
                <div className="member-main">
                  <div className="member-name-line">
                    <span className="member-display-name">{name}</span>
                    {role && <span className={`pill sm role-${role}`}>{role}</span>}
                  </div>
                </div>
                <input
                  className="member-name-input"
                  aria-label={`Nickname for ${name}`}
                  placeholder="Nickname override…"
                  defaultValue={nameMap[id] || ''}
                  onBlur={e => setDisplayName(id, e.target.value.trim())}
                />
              </li>
            )
          })}
        </ul>
        {!isArchived && (
          <div className="add-member-box">
            <div className="add-member-title">Add a new member</div>
            <form onSubmit={addMember} className="inline-form">
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
              <button type="submit" className="btn btn-secondary sm"
                disabled={!newMember || !canAddMember(selectedProject, currentUser.email, newMemberRole).allowed}>
                Add Member
              </button>
            </form>
            {!canAddMember(selectedProject, currentUser.email, newMemberRole).allowed && (
              <p className="context-line" role="status" style={{ marginTop: 8 }}>
                {canAddMember(selectedProject, currentUser.email, newMemberRole).reason}
              </p>
            )}
            {availableUsers.length === 0 && (
              <p className="context-line" style={{ marginTop: 8 }}>
                Everyone with an account is already a member of this project.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="divider" />

      <button onClick={loadProjectHistory} className="btn btn-secondary sm history-toggle" disabled={loadingProjHistory}>
        {loadingProjHistory ? '…' : (showProjectHistory ? 'Refresh Project History' : 'View Project History')}
      </button>

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
                  members <b>{e.value.members.map(m => displayName(memberId(m))).join(', ')}</b>
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

export default ProjectPage
