// One place for every request to the backend.
// Cookies (the login session) are same-origin: in development Vite proxies
// /api to the backend (see vite.config.js), in production the backend serves
// the built client itself.

import { busy, isMutating } from './busy.js'

export const API = '/api'

export class ApiError extends Error {
  constructor(message, status = 0, problems = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problems = problems
  }
}

// Returns the raw Response. A 401 from any NON-auth call means the session
// ended (expired, signed out elsewhere, password changed on another device),
// so the whole app is told to drop back to the sign-in page.
export async function apiFetch(path, options = {}) {
  const url = path.startsWith(API) ? path : `${API}${path}`
  const { json, ...rest } = options
  const headers = { ...(rest.headers || {}) }
  const init = { credentials: 'same-origin', ...rest, headers }
  if (json !== undefined) {
    init.body = JSON.stringify(json)
    headers['Content-Type'] = 'application/json'
  }
  // State-changing requests hold the global lock until the server answers.
  const release = isMutating(init.method) ? busy.begin() : null
  let res
  try {
    res = await fetch(url, init)
  } finally {
    if (release) release()
  }
  if (res.status === 401 && !url.startsWith(`${API}/auth/`)) {
    window.dispatchEvent(new Event('auth:expired'))
  }
  return res
}

// Parsed JSON, or an ApiError carrying .status and .problems.
export async function api(path, options = {}) {
  let res
  try {
    res = await apiFetch(path, options)
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 0)
  }
  let data = null
  if (res.status !== 204) {
    try { data = await res.json() } catch { data = null }
  }
  if (!res.ok && !data && res.status >= 500) {
    // No JSON body = the request never reached our backend (Vite's proxy answers 500/502/504 when it is down).
    throw new ApiError('The backend is not responding. Start it with "node app.js" in pm-backend and check its terminal for errors.', res.status)
  }
  if (!res.ok) {
    throw new ApiError((data && data.error) || 'Something went wrong. Please try again.', res.status, (data && data.problems) || [])
  }
  return data
}
