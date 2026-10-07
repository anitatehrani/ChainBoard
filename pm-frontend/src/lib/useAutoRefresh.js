import { useEffect, useRef } from 'react'
import { BASE_MS, nextDelay, shouldRun } from '../refreshLogic'

// Calls `refresh()` every BASE_MS while the tab is visible and `enabled`, runs it
// at once when the tab becomes visible again, never overlaps two runs, and backs
// off after failures. `isBusy()` lets the caller pause it (e.g. mid-edit).
// A failed refresh is silent: the screen keeps showing the last good data.
export function useAutoRefresh(refresh, { enabled, isBusy = () => false, intervalMs = BASE_MS }) {
  const latest = useRef({ refresh, isBusy })
  latest.current = { refresh, isBusy }

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    let failures = 0
    let running = false
    let stopped = false

    const ok = () => shouldRun({
      enabled: true,
      visible: document.visibilityState === 'visible',
      online: navigator.onLine,
      busy: running || latest.current.isBusy()
    })

    async function tick() {
      if (stopped) return
      if (ok()) {
        running = true
        try { await latest.current.refresh(); failures = 0 } catch { failures += 1 }
        running = false
      }
      if (!stopped) timer = setTimeout(tick, nextDelay(failures, intervalMs))
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !running) {
        clearTimeout(timer)
        timer = setTimeout(tick, 300)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    timer = setTimeout(tick, intervalMs)

    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [enabled, intervalMs])
}
