// Heartbeat worker: posts every 500 ms. Worker timers keep running in background tabs.
const scope = self as unknown as { postMessage(message: number): void }

setInterval(() => scope.postMessage(Date.now()), 500)
