import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const AuthContext = createContext(null)

const PUBLIC_PATHS = ['/login', '/signup', '/verify-email']
const DEEP_LINK_KEY = 'pm_deeplink'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [googleClientId, setGoogleClientId] = useState(null)
  const [loading, setLoading] = useState(true)

  // On load: ask the server which sign-in options exist and who (if anyone)
  // the session cookie belongs to.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await api('/auth/config')
        if (!cancelled) setGoogleClientId(cfg.googleClientId || null)
      } catch { /* sign-in still works without Google */ }
      try {
        const me = await api('/auth/me')
        if (!cancelled) setUser(me.user)
      } catch { /* not signed in */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Any non-auth request that comes back 401 drops the app to the sign-in page.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  // Signed out on an unknown route: go to /login and remember where the person
  // was heading, then open it after they sign in.
  useEffect(() => {
    if (loading) return
    const { pathname, search, hash } = window.location
    if (!user) {
      if (!PUBLIC_PATHS.includes(pathname)) {
        if (pathname !== '/') sessionStorage.setItem(DEEP_LINK_KEY, `${pathname}${search}${hash}`)
        window.history.replaceState(null, '', '/login')
      }
    } else {
      const deepLink = sessionStorage.getItem(DEEP_LINK_KEY)
      if (deepLink) {
        sessionStorage.removeItem(DEEP_LINK_KEY)
        window.history.replaceState(null, '', deepLink)
      } else if (pathname === '/login' || pathname === '/signup') {
        window.history.replaceState(null, '', '/')
      }
    }
  }, [user, loading])

  const login = useCallback(async (identifier, password) => {
    const data = await api('/auth/login', { method: 'POST', json: { identifier, password } })
    setUser(data.user)
    return data.user
  }, [])

  const signup = useCallback(async (fields) => {
    const data = await api('/auth/signup', { method: 'POST', json: fields })
    setUser(data.user)
    return data.user
  }, [])

  const loginWithGoogle = useCallback(async (idToken) => {
    const data = await api('/auth/google', { method: 'POST', json: { idToken } })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* the cookie is cleared server-side; nothing else to undo */ }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, googleClientId, loading, login, signup, loginWithGoogle, logout, setUser }),
    [user, googleClientId, loading, login, signup, loginWithGoogle, logout]
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
