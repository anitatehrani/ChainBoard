import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { checkPassword } from '../lib/passwordRules'
import PasswordField from './PasswordField'
import GoogleButton from './GoogleButton'

import { EMAIL_RE, normalizeUsername, usernameHint, suggestUsername, usernameStatus, signupBlocker } from '../authLogic'
import './auth.css'

function ErrorBanner({ error }) {
  if (!error) return null
  return (
    <div className="error-banner" role="alert">
      <div>{error.message}</div>
      {error.problems && error.problems.length > 0 && (
        <ul>{error.problems.map(p => <li key={p}>{p}</li>)}</ul>
      )}
    </div>
  )
}

function AuthPage({ theme, toggleTheme }) {
  const { login, signup, loginWithGoogle, googleClientId } = useAuth()
  const [mode, setMode] = useState(() => (window.location.pathname === '/signup' ? 'signup' : 'login'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // login
  const [identifier, setIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // sign-up
  const [form, setForm] = useState({ name: '', email: '', username: '', phone: '', password: '', confirm: '' })
  const [avail, setAvail] = useState({ state: 'idle', reason: '' })

  useEffect(() => {
    const onPop = () => setMode(window.location.pathname === '/signup' ? 'signup' : 'login')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function switchMode(next) {
    window.history.pushState(null, '', next === 'signup' ? '/signup' : '/login')
    setMode(next)
    setError(null)
  }

  // Live "is this username free?" check (debounced).
  useEffect(() => {
    if (mode !== 'signup') return undefined
    const u = normalizeUsername(form.username)
    if (!u) { setAvail({ state: 'idle', reason: '' }); return undefined }
    const local = usernameHint(u)
    if (local) { setAvail({ state: 'bad', reason: local }); return undefined }
    setAvail({ state: 'checking', reason: '' })
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/auth/username-available?u=${encodeURIComponent(u)}`)
        if (!cancelled) setAvail(data.available ? { state: 'ok', reason: '' } : { state: 'bad', reason: data.reason })
      } catch (err) {
        if (!cancelled) setAvail({ state: 'error', reason: `Could not check right now (${err.message}) — the server will check when you submit.` })
      }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.username, mode])

  const pwContext = useMemo(
    () => ({ email: form.email, username: normalizeUsername(form.username), name: form.name }),
    [form.email, form.username, form.name]
  )
  const passwordProblems = checkPassword(form.password, pwContext)
  const passwordsMatch = form.password === form.confirm // used for the mismatch message below
  const blocker = signupBlocker({
    name: form.name, email: form.email, avail, passwordProblems,
    password: form.password, confirm: form.confirm
  })
  const canSignUp = !busy && blocker === null
  const uStatus = usernameStatus(avail)

  function set(field) { return (e) => setForm(f => ({ ...f, [field]: e.target.value })) }

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError({ message: err.message, problems: err.problems || [] })
    }
    setBusy(false)
  }

  function handleLogin(e) {
    e.preventDefault()
    return run(() => login(identifier, loginPassword))
  }

  function handleSignup(e) {
    e.preventDefault()
    if (!canSignUp) return undefined
    return run(() => signup({
      name: form.name.trim(),
      email: form.email.trim(),
      username: normalizeUsername(form.username),
      phone: form.phone.trim() || undefined,
      password: form.password
    }))
  }

  const handleGoogle = (idToken) => run(() => loginWithGoogle(idToken))

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-top">
          <div className="header-icon">⛓</div>
          <button type="button" className="theme-toggle" onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        <h2 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="context-line auth-subtitle">
          {mode === 'login'
            ? 'Sign in to ChainBoard — Hyperledger Fabric · IPFS'
            : 'Your account is recorded on the blockchain ledger.'}
        </p>

        <ErrorBanner error={error} />

        {googleClientId ? (
          <>
            <GoogleButton
              clientId={googleClientId}
              onCredential={handleGoogle}
              text={mode === 'login' ? 'signin_with' : 'signup_with'}
            />
            <div className="auth-divider"><span>or use your email</span></div>
          </>
        ) : (
          <p className="context-line auth-hint">
            Google sign-in is not set up on this server yet — use your email below.
          </p>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="form" noValidate>
            <div className="field">
              <label htmlFor="identifier" className="field-label-text">Email or username</label>
              <input
                id="identifier" value={identifier} onChange={e => setIdentifier(e.target.value)}
                autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                required autoFocus
              />
            </div>
            <PasswordField
              label="Password" value={loginPassword} onChange={setLoginPassword}
              autoComplete="current-password"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !identifier || !loginPassword}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} className="form" noValidate>
            <div className="field">
              <label htmlFor="su-name" className="field-label-text">Full name</label>
              <input id="su-name" value={form.name} onChange={set('name')} autoComplete="name" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="su-email" className="field-label-text">Email</label>
              <input
                id="su-email" type="email" value={form.email} onChange={set('email')}
                onBlur={() => {
                  if (!form.username && EMAIL_RE.test(form.email.trim())) {
                    const s = suggestUsername(form.email.trim())
                    if (s) setForm(f => ({ ...f, username: s }))
                  }
                }}
                autoComplete="email" autoCapitalize="none" spellCheck={false} required
              />
            </div>
            <div className="field">
              <label htmlFor="su-username" className="field-label-text">Username</label>
              <div className="username-wrap">
                <span className="username-at" aria-hidden="true">@</span>
                <input
                  id="su-username" value={form.username} onChange={set('username')}
                  autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  aria-describedby="su-username-hint" required
                />
              </div>
              <div id="su-username-hint" className={`field-hint ${uStatus.tone === 'neutral' ? '' : uStatus.tone}`} aria-live="polite">
                {uStatus.text}
              </div>
            </div>
            <div className="field">
              <label htmlFor="su-phone" className="field-label-text">Phone <span className="optional">(optional)</span></label>
              <input
                id="su-phone" type="tel" value={form.phone} onChange={set('phone')}
                placeholder="+49 170 1234567" autoComplete="tel"
              />
              <div className="field-hint">International format, e.g. +49 170 1234567</div>
            </div>
            <PasswordField
              label="Password" value={form.password}
              onChange={(v) => setForm(f => ({ ...f, password: v }))}
              autoComplete="new-password" showChecklist ctx={pwContext}
            />
            <PasswordField
              label="Confirm password" value={form.confirm}
              onChange={(v) => setForm(f => ({ ...f, confirm: v }))}
              autoComplete="new-password"
            />
            {form.confirm.length > 0 && !passwordsMatch && (
              <div className="field-hint bad" role="alert">The two passwords do not match.</div>
            )}
            <button type="submit" className="btn btn-primary" disabled={!canSignUp} aria-describedby="su-blocker">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            <div id="su-blocker" className="field-hint" aria-live="polite">{!busy && blocker}</div>
          </form>
        )}

        <p className="context-line auth-footer">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="link-btn" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export default AuthPage
