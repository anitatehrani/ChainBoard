import { useState } from 'react'
import { api } from '../lib/api'
import './nav.css'
import './auth.css'

// Opened from the link in the confirmation email. The token is spent ONLY when
// the person presses the button, so mail scanners that merely open the link
// cannot use it up.
function VerifyEmailPage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [state, setState] = useState(token ? 'ready' : 'missing') // ready | busy | done | error | missing
  const [message, setMessage] = useState('')

  async function confirm() {
    setState('busy')
    try {
      await api('/auth/email/verify', { method: 'POST', json: { token } })
      setState('done')
    } catch (err) {
      setMessage(err.message)
      setState('error')
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="header-icon verify-icon" aria-hidden="true">@</div>
        <h2 className="auth-title">Confirm your email</h2>

        {state === 'ready' && (
          <>
            <p className="context-line auth-subtitle">Press the button to confirm this address.</p>
            <div className="verify-actions">
              <button className="btn btn-primary" onClick={confirm}>Confirm my email address</button>
            </div>
          </>
        )}
        {state === 'busy' && <p className="context-line auth-subtitle">Confirming…</p>}
        {state === 'done' && (
          <>
            <div className="success-banner" role="status">Your email address is confirmed. Thank you!</div>
            <div className="verify-actions">
              <button className="btn btn-primary" onClick={() => window.location.assign('/')}>Continue</button>
            </div>
          </>
        )}
        {state === 'error' && (
          <>
            <div className="error-banner" role="alert">{message}</div>
            <p className="context-line auth-subtitle">
              Sign in and use "Send confirmation email" in your account settings to get a new link.
            </p>
            <div className="verify-actions">
              <button className="btn btn-secondary" onClick={() => window.location.assign('/')}>Go to the app</button>
            </div>
          </>
        )}
        {state === 'missing' && (
          <>
            <div className="error-banner" role="alert">This confirmation link is incomplete.</div>
            <div className="verify-actions">
              <button className="btn btn-secondary" onClick={() => window.location.assign('/')}>Go to the app</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default VerifyEmailPage
