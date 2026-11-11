import { useEffect, useState } from 'react'
import { subscribeTick } from './ticker'

/** Current timestamp, refreshed whenever the value crosses a `resolutionMs` boundary. */
export function useNow(resolutionMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(
    () =>
      subscribeTick((t) =>
        setNow((prev) => (Math.floor(t / resolutionMs) !== Math.floor(prev / resolutionMs) ? t : prev)),
      ),
    [resolutionMs],
  )
  return now
}

/** Animation-frame clock for smooth counters (stopwatch). Pauses when `active` is false. */
export function useFrameNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let raf = 0
    const loop = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active])
  return now
}
