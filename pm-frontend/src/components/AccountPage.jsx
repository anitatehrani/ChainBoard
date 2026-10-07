import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { checkPassword } from '../lib/passwordRules'
import PasswordField from './PasswordField'
import GoogleButton from './GoogleButton'

import { describeEvents } from '../authLogic'
import './auth.css'

function Section({ title, badge, children }) {
  return (
    <section className="card wide account-section">
      <div className="card-header">
        <span className={`card-badge ${badge || 'project'}`}>{title}</span>
      </div>
      {children}
    </section>
  )
}

function AccountPage({ notify, onLogout }) {
  const { user, setUser, googleClientId } = useAuth()

  // password
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState(null)
  const [pwDone, setPwDone] = useState('')

  // email confirmation
  const [mailBusy, setMailBusy] = useState(false)
  const [devLink, setDevLink] = useState('')

  // google
  const [googleBusy, setGoogleBusy] = useState(false)

  // on-chain security activity
  const [events, setEvents] = useState(null)
  const loadEvents = useCallback(async () => {
    try {
      const data = await api('/auth/security-log')
      setEvents(describeEvents(data.events))
    } catch { setEvents([]) }
  }, [])
  useEffect(() => { loadEvents() }, [loadEvents])

  const ctx = useMemo(() => ({ email: user.email, username: user.username, name: user.name }), [user])
  const problems = checkPassword(next, ctx)
  const canChange =
    !pwBusy && next.length > 0 && problems.length === 0 && next === confirm &&
    (!user.has_password || current.length > 0)

  async function changePassword(e) {
    e.preventDefault()
    setPwBusy(true); setPwError(null); setPwDone('')
    try {
      const data = await api('/auth/password', {
        method: 'POST',
        json: { currentPassword: user.has_password ? current : undefined, newPassword: next }
      })
      setUser(data.user)
      setCurrent(''); setNext(''); setConfirm('')
      setPwDone('Password updated. Other devices were signed out.')
      loadEvents()
    } catch (err) {
      setPwError({ message: err.message, problems: err.problems || [] })
    }
    setPwBusy(false)
  }

  async function sendConfirmation() {
    setMailBusy(true)
    try {
      const data = await api('/auth/email/send-verification', { method: 'POST', json: {} })
      if (data.alreadyVerified) notify('Your email address is already confirmed.')
      else notify('Confirmation email sent.')
      setDevLink(data.dev_link || '')
    } catch (err) {
      notify(err.message, 'error')
    }
    setMailBusy(false)
  }

  async function connectGoogle(idToken) {
    setGoogleBusy(true)
    try {
      const data = await api('/auth/google/link', { method: 'POST', json: { idToken } })
      setUser(data.user)
      notify('Google account connected.')
      loadEvents()
    } catch (err) {
      notify(err.message, 'error')
    }
    setGoogleBusy(false)
  }

  async function disconnectGoogle() {
    setGoogleBusy(true)
    try {
      const data = await api('/auth/google', { method: 'DELETE' })
      setUser(data.user)
      notify('Google account disconnected.')
      loadEvents()
    } catch (err) {
      notify(err.message, 'error')
    }
    setGoogleBusy(false)
  }

  return (
    <div className="account-page">
      <Section title="Account">
        <div className="account-row">
          {user.avatar_url
            ? <img className="account-avatar" src={user.avatar_url} alt="" referrerPolicy="no-referrer" />
            : <div className="account-avatar placeholder">{user.name.charAt(0).toUpperCase()}</div>}
          <div>
            <div className="account-name">{user.name}</div>
            <div className="context-line" style={{ margin: 0 }}>
              @{user.username} · {user.email}{user.phone ? ` · ${user.phone}` : ''}
            </div>
          </div>
          <button className="btn btn-secondary sm account-signout" onClick={onLogout}>Sign out</button>
        </div>
      </Section>

      <Section title="Email confirmation" badge="task">
        <p className="context-line">
          {user.email_verified
            ? 'Confirmed: your email address is verified.'
            : 'Your email address is not confirmed yet. You can use the app without it; confirming is only needed for features that send you email.'}
        </p>
        {!user.email_verified && (
          <button className="btn btn-secondary sm" onClick={sendConfirmation} disabled={mailBusy}>
            {mailBusy ? 'Sending…' : 'Send confirmation email'}
          </button>
        )}
        {devLink && (
          <p className="context-line" style={{ marginTop: 10 }}>
            Mail is in <b>preview mode</b> (no mail server configured). Open this link to confirm:{' '}
            <a href={devLink}>confirm my email</a>
          </p>
        )}
      </Section>

      <Section title="Password" badge="audit">
        <form onSubmit={changePassword} className="form" noValidate>
          {pwError && (
            <div className="error-banner" role="alert">
              <div>{pwError.message}</div>
              {pwError.problems.length > 0 && <ul>{pwError.problems.map(p => <li key={p}>{p}</li>)}</ul>}
            </div>
          )}
          {pwDone && <div className="success-banner" role="status">{pwDone}</div>}
          {!user.has_password && (
            <p className="context-line">
              This account signs in with Google only. Set a password to also sign in with your email or username.
            </p>
          )}
          {user.has_password && (
            <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" />
          )}
          <PasswordField
            label={user.has_password ? 'New password' : 'Password'} value={next} onChange={setNext}
            autoComplete="new-password" showChecklist ctx={ctx}
          />
          <PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {confirm.length > 0 && next !== confirm && (
            <div className="field-hint bad" role="alert">The two passwords do not match.</div>
          )}
          <button type="submit" className="btn btn-primary" disabled={!canChange}>
            {pwBusy ? 'Saving…' : (user.has_password ? 'Change password' : 'Set password')}
          </button>
        </form>
      </Section>

      <Section title="Google" badge="project">
        {user.google_linked ? (
          <>
            <p className="context-line">Connected: you can sign in with your Google account.</p>
            <button
              className="btn btn-danger sm" onClick={disconnectGoogle}
              disabled={googleBusy || !user.has_password}
              title={!user.has_password ? 'Set a password first, otherwise you could not sign in again.' : ''}
            >
              Disconnect Google
            </button>
            {!user.has_password && (
              <p className="context-line" style={{ marginTop: 8 }}>Set a password above to be able to disconnect Google.</p>
            )}
          </>
        ) : googleClientId ? (
          <>
            <p className="context-line">Connect a Google account to sign in with one click.</p>
            <GoogleButton clientId={googleClientId} onCredential={connectGoogle} text="continue_with" />
          </>
        ) : (
          <p className="context-line">Google sign-in is not set up on this server yet.</p>
        )}
      </Section>

      <Section title="Security activity (on-chain)" badge="audit">
        <p className="context-line">
          Every sign-up and account change is a blockchain transaction, so this history cannot be edited or erased.
        </p>
        {events === null && <p className="context-line">Loading…</p>}
        {events && events.length === 0 && <p className="context-line">Nothing recorded yet.</p>}
        {events && events.length > 0 && (
          <ol className="timeline compact timeline-list" aria-label="Security activity, newest first">
            {events.map((e, i) => (
              <li key={`${e.txId}-${i}`} className="timeline-item">
                <div className="timeline-dot" style={{ background: 'var(--accent)' }} />
                <div className="timeline-content">
                  <div className="timeline-row">
                    <span>{e.text}</span>
                    <span className="mono tx-id" title={e.txId}>tx {e.txId.slice(0, 10)}…</span>
                  </div>
                  <div className="timeline-meta">{e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}

export default AccountPage
