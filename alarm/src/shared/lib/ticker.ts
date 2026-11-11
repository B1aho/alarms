type Listener = (now: number) => void

const listeners = new Set<Listener>()
let started = false

function emit() {
  const now = Date.now()
  listeners.forEach((l) => l(now))
}

/**
 * Timers on the main thread of a background tab are throttled hard by browsers.
 * Dedicated workers are not subject to intensive throttling, so the heartbeat
 * lives in a worker and falls back to setInterval when workers are unavailable.
 */
function start() {
  if (started) return
  started = true
  try {
    const worker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = emit
  } catch {
    setInterval(emit, 500)
  }
  document.addEventListener('visibilitychange', emit)
  window.addEventListener('focus', emit)
}

export function subscribeTick(listener: Listener): () => void {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}
