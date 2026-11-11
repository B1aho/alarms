/**
 * Entry of the `engine` utility process (forked by `shell`). No Electron imports:
 * the utility process exposes `process.parentPort`, which carries `MessagePort`s from `main`.
 *
 * argv: --data=<dir>  [--test]  [--test-clock=<epoch ms>]
 */

import crypto from 'node:crypto'
import { ENGINE_CONTROL, ROLES } from '../contract/channels.js'
import { createClock, startHeartbeat } from './clock.js'
import { createEngine } from './engine.js'

/** @param {string} name */
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const dataDir = arg('data')
if (!dataDir) {
  console.error('[engine] --data=<dir> is required')
  process.exit(2)
}
const testMode = process.argv.includes('--test')
const testClock = Number(arg('test-clock'))
const clock = createClock({ offsetMs: testMode && Number.isFinite(testClock) ? testClock - Date.now() : 0 })
const rng = () => crypto.randomBytes(4).readUInt32LE(0) / 4294967296
const log = (/** @type {string} */ msg) => console.log(msg)

const engine = createEngine({ dataDir, clock, rng, testMode, log })
log(`[engine] started pid=${process.pid} events=${engine.journalStats.applied} skipped=${engine.journalStats.skipped}`)

/**
 * Electron's utility-process parent port (typed loosely: this file must not import electron).
 * @type {{ on: (ev: 'message', fn: (e: { data: any, ports: any[] }) => void) => void, postMessage: (m: unknown) => void }}
 */
const parentPort = /** @type {any} */ (process).parentPort

/** @type {(() => void) | null} */
let heartbeat = null

parentPort.on('message', (e) => {
  const data = e.data
  if (data?.kind !== ENGINE_CONTROL.attach || !ROLES.includes(data.role) || !e.ports?.[0]) return
  const port = e.ports[0]
  const id = engine.connect(data.role, (msg) => port.postMessage(msg))
  // The scheduler starts once the shell listens, so notifications of the first tick
  // (e.g. a missed alarm after the app was closed) are never lost.
  if (data.role === 'shell' && !heartbeat) heartbeat = startHeartbeat(() => engine.tick())
  port.on('message', (/** @type {{ data: unknown }} */ m) => engine.receive(id, m.data))
  port.on('close', () => engine.disconnect(id))
  port.start()
})

process.on('uncaughtException', (err) => {
  console.error('[engine] uncaught', err)
  process.exit(1)
})
