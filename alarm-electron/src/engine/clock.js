/**
 * Engine clock and scheduler heartbeat: a tick every 500 ms, plus an immediate tick
 * when the wall clock jumps by more than 2 s (sleep/wake, manual clock change).
 * In test mode the clock can be offset (`--test-clock=<epoch ms>` or `TestSetClock`).
 */

export const TICK_MS = 500
export const JUMP_MS = 2000

/** @param {{ offsetMs?: number }} [opts] */
export function createClock(opts = {}) {
  let offset = opts.offsetMs ?? 0
  return {
    now: () => Date.now() + offset,
    /** @param {number} t */
    set(t) {
      offset = t - Date.now()
    },
    offsetMs: () => offset,
  }
}

/** @typedef {ReturnType<typeof createClock>} Clock */

/**
 * @param {(reason: 'interval' | 'jump') => void} onTick
 * @param {{ intervalMs?: number, jumpMs?: number }} [opts]
 * @returns {() => void} stop
 */
export function startHeartbeat(onTick, opts = {}) {
  const intervalMs = opts.intervalMs ?? TICK_MS
  const jumpMs = opts.jumpMs ?? JUMP_MS
  let lastWall = Date.now()
  let lastMono = performance.now()
  const timer = setInterval(() => {
    const wall = Date.now()
    const mono = performance.now()
    const drift = Math.abs(wall - lastWall - (mono - lastMono))
    const gap = mono - lastMono
    lastWall = wall
    lastMono = mono
    onTick(drift > jumpMs || gap > intervalMs + jumpMs ? 'jump' : 'interval')
  }, intervalMs)
  return () => clearInterval(timer)
}
