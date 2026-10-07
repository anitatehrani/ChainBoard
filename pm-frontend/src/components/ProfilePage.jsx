import { useState } from 'react'
import { avatarColor, initial } from '../projectLogic'
import {
  memberSince, roleIn, profileStats, statsText, sharedProjects, teammates, accountBadges
} from '../profileLogic'
import './profile.css'

// A read-only profile built from data already on the ledger: the signed-in
// account, the projects it belongs to, and the people it works with.
function ProfilePage({ user, myProjects, loadingMyProjects, userDirectory, selectMyProject, goTo }) {
  const [openPerson, setOpenPerson] = useState(null)
  if (!user) return null

  const stats = profileStats(myProjects, user.email)
  const people = teammates(myProjects, user.email, userDirectory)
  const since = memberSince(user.created_at)

  return (
    <div className="profile-page">
      <section className="card wide profile-head">
        <div className="profile-avatar" aria-hidden="true"
          style={user.avatar_url ? undefined : { background: avatarColor(user.email) }}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
            : initial(user.name)}
        </div>
        <div className="profile-id">
          <h2 className="profile-name">{user.name}</h2>
          <div className="profile-handle">@{user.username}</div>
          <dl className="profile-facts">
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            {user.phone && <div><dt>Phone</dt><dd>{user.phone}</dd></div>}
            {since && <div><dt>Member since</dt><dd>{since}</dd></div>}
          </dl>
          <ul className="profile-badges" aria-label="Account status">
            {accountBadges(user).map(b => <li key={b} className="profile-badge">{b}</li>)}
          </ul>
        </div>
        <button className="btn btn-secondary" onClick={() => goTo('settings')}>Settings</button>
      </section>

      <section className="card wide" aria-labelledby="profile-stats-title">
        <div className="card-header">
          <span className="card-badge project" id="profile-stats-title">Overview</span>
        </div>
        <div className="stat-grid profile-stats">
          <div className="stat-card"><div className="stat-value">{stats.projects}</div><div className="stat-label">Active projects</div></div>
          <div className="stat-card"><div className="stat-value">{stats.owner}</div><div className="stat-label">As owner</div></div>
          <div className="stat-card"><div className="stat-value">{stats.admin + stats.contributor}</div><div className="stat-label">As admin or contributor</div></div>
        </div>
        <p className="progress-text">{statsText(stats)} · {people.length} {people.length === 1 ? 'teammate' : 'teammates'}</p>
        <p className="context-line">
          This profile is built from your on-chain account and project memberships. Names and roles change
          only through ledger transactions; see Settings, then Security and sign-in, for your security history.
        </p>
      </section>

      <section className="card wide" aria-labelledby="profile-projects-title">
        <div className="card-header">
          <span className="card-badge audit" id="profile-projects-title">Projects</span>
        </div>
        {loadingMyProjects ? (
          <p className="context-line">Loading your projects…</p>
        ) : myProjects.length === 0 ? (
          <div className="dash-empty">You are not in any project yet. Create one from the Dashboard, or ask an owner to add you.</div>
        ) : (
          <ul className="project-list">
            {myProjects.map(p => {
              const role = roleIn(p, user.email)
              const state = p.status === 'archived' ? 'archived' : 'active'
              return (
                <li key={p.projectId}>
                  <button type="button" className="project-row" data-state={state}
                    onClick={() => selectMyProject(p)}
                    aria-label={`Open project ${p.name}, your role ${role}, ${state}`}>
                    <span className="project-row-main">
                      <span className="project-row-name">{p.name}</span>
                      <span className="project-row-sub">Your role: {role}</span>
                    </span>
                    <span className="state-tag" data-state={state}>{p.status}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card wide" aria-labelledby="profile-people-title">
        <div className="card-header">
          <span className="card-badge task" id="profile-people-title">People you work with</span>
        </div>
        {people.length === 0 ? (
          <div className="dash-empty">Nobody else is in your projects yet.</div>
        ) : (
          <ul className="people-list">
            {people.map(p => {
              const open = openPerson === p.email
              const shared = open ? sharedProjects(myProjects, user.email, p.email) : []
              return (
                <li key={p.email} className="person">
                  <button type="button" className="person-row" aria-expanded={open}
                    onClick={() => setOpenPerson(open ? null : p.email)}>
                    <span className="member-avatar" aria-hidden="true" style={{ background: avatarColor(p.email) }}>
                      {initial(p.name)}
                    </span>
                    <span className="person-main">
                      <span className="person-name">{p.name}</span>
                      <span className="person-sub">
                        {p.username ? `@${p.username} · ` : ''}{p.shared} shared {p.shared === 1 ? 'project' : 'projects'}
                      </span>
                    </span>
                    <span className="person-toggle">{open ? 'Hide' : 'Show'}</span>
                  </button>
                  {open && (
                    <ul className="person-shared">
                      {shared.map(s => (
                        <li key={s.projectId}>
                          {s.name} — {p.name.split(' ')[0]} is {s.role}{s.status === 'archived' ? ' (archived)' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

export default ProfilePage
