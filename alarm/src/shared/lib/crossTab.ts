/**
 * Cross-tab helpers. If the app is open in several tabs, only one tab (the
 * lock holder) runs an engine, so an alarm never rings twice. Data changes are
 * broadcast so every tab shows fresh state.
 */

export function createChannel(name: string) {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`alarm:${name}`)
  return {
    post() {
      channel?.postMessage('changed')
    },
    subscribe(cb: () => void): () => void {
      if (!channel) return () => {}
      const handler = () => cb()
      channel.addEventListener('message', handler)
      return () => channel.removeEventListener('message', handler)
    },
  }
}

/** Runs `start` while this tab holds the named Web Lock. Returns a disposer. */
export function runAsLeader(lockName: string, start: () => () => void): () => void {
  let disposed = false
  let stop: (() => void) | null = null
  let release: (() => void) | null = null

  if (!('locks' in navigator) || !navigator.locks) {
    stop = start()
    return () => stop?.()
  }

  void navigator.locks.request(
    `alarm:${lockName}`,
    () =>
      new Promise<void>((resolve) => {
        if (disposed) return resolve()
        release = resolve
        stop = start()
      }),
  )

  return () => {
    disposed = true
    stop?.()
    release?.()
  }
}
