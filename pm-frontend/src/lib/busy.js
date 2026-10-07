// One global "a change is being sent to the server" lock.
//
// Every state-changing request (anything but GET/HEAD) goes through apiFetch,
// which calls busy.begin() synchronously, in the same tick as the click. While
// at least one such request is in flight, installBusyGuard() swallows further
// button clicks and form submits, so nothing can be sent twice, including
// double-clicks, repeated Enter presses and clicks on different buttons.
// Background GET polling never takes the lock.

export function createBusyTracker() {
  let count = 0
  const listeners = new Set()
  const emit = () => listeners.forEach(fn => fn(count > 0))
  return {
    get count() { return count },
    get busy() { return count > 0 },
    // Returns a function that releases this one request (safe to call twice).
    begin() {
      count++
      emit()
      let released = false
      return () => {
        if (released) return
        released = true
        count = Math.max(0, count - 1)
        emit()
      }
    },
    // Runs an async job under the lock (used for non-API requests such as IPFS uploads).
    async run(job) {
      const done = this.begin()
      try { return await job() } finally { done() }
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }
  }
}

export const busy = createBusyTracker()

export function isMutating(method) {
  const m = String(method || 'GET').toUpperCase()
  return m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS'
}

// Browser only. Blocks clicks and submits while busy and marks the button that
// started the request, so the person sees which action is running.
export function installBusyGuard(doc = document, tracker = busy) {
  let marked = null

  function block(e) {
    if (!tracker.busy) return
    const target = e.target instanceof Element ? e.target : null
    if (e.type === 'submit') { e.preventDefault(); e.stopPropagation(); return }
    const button = target && target.closest('button, [role="button"], [type="submit"]')
    if (!button || button.closest('[data-allow-while-busy]')) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
  }

  // Remember the button being used at the moment a request starts.
  function remember() {
    const a = doc.activeElement
    if (a && a.tagName === 'BUTTON' && !marked) { marked = a; a.setAttribute('data-loading', 'true') }
  }

  const unsubscribe = tracker.subscribe(isBusy => {
    const root = doc.documentElement
    if (isBusy) {
      root.setAttribute('data-busy', 'true')
      root.setAttribute('aria-busy', 'true')
      remember()
    } else {
      root.removeAttribute('data-busy')
      root.removeAttribute('aria-busy')
      if (marked) { marked.removeAttribute('data-loading'); marked = null }
    }
  })

  // Capture phase on the document runs before React's own listeners.
  doc.addEventListener('click', block, true)
  doc.addEventListener('submit', block, true)
  doc.addEventListener('keydown', e => {
    // Enter on a focused button or in a field would also trigger its action.
    if (tracker.busy && (e.key === 'Enter' || e.key === ' ') && e.target instanceof Element &&
        e.target.closest('button, input, select, textarea') && !e.target.closest('[data-allow-while-busy]')) {
      e.preventDefault()
    }
  }, true)

  return () => {
    unsubscribe()
    doc.removeEventListener('click', block, true)
    doc.removeEventListener('submit', block, true)
  }
}
