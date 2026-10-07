import { useEffect, useRef, useState } from 'react'

// Official Google Identity Services button. It hands back a signed ID token;
// the server verifies it (no client secret, no redirect URIs needed).

let gsiPromise = null
function loadGoogleScript() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve()
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => { gsiPromise = null; reject(new Error('Google script failed to load')) }
      document.head.appendChild(script)
    })
  }
  return gsiPromise
}

function GoogleButton({ clientId, onCredential, text = 'signin_with' }) {
  const slot = useRef(null)
  const latest = useRef(onCredential)
  latest.current = onCredential
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        if (cancelled || !slot.current) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => latest.current(response.credential)
        })
        window.google.accounts.id.renderButton(slot.current, {
          theme: 'outline', size: 'large', width: 320, text
        })
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [clientId, text])

  if (failed) return <p className="context-line">Google sign-in could not be loaded right now.</p>
  return <div ref={slot} className="google-btn-slot" />
}

export default GoogleButton
