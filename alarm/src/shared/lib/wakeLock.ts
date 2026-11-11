import { useEffect } from 'react'

/** Keeps the display awake (and with it the machine) while `active` and the page is visible. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      if (sentinel && !sentinel.released) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) void s.release()
        else sentinel = s
      } catch {
        // Denied (e.g. battery saver). Nothing else we can do from the web.
      }
    }

    const onVisibility = () => void acquire()
    void acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release()
    }
  }, [active])
}
