/**
 * Bus broker. Forks the `engine` utility process and hands every participant a MessagePort to it:
 * `shell` itself (port kept here), the `audio` renderer and the `ui` renderer.
 * If the engine dies, it is re-forked within ~0.3 s and every live participant gets a fresh port.
 */

import { MessageChannelMain, utilityProcess } from 'electron'
import { ENGINE_CONTROL, IPC, SUBSCRIPTIONS } from '../contract/channels.js'
import { checkMessage } from '../contract/schemas/validate.js'

/** @typedef {import('../contract/channels.js').Role} Role */
/** @typedef {Electron.WebContents} WebContents */

export const RESTART_DELAY_MS = 300

/**
 * @param {object} o
 * @param {string} o.enginePath
 * @param {string[]} o.engineArgs
 * @param {(msg: any) => void} o.onMessage validated messages from the engine to shell
 * @param {() => void} o.onEngineStart called after each (re)start, once shell is connected
 * @param {(msg: string) => void} o.log
 */
export function createBroker(o) {
  /** @type {Electron.UtilityProcess | null} */
  let child = null
  /** @type {Electron.MessagePortMain | null} */
  let shellPort = null
  /** @type {Map<number, { role: Role, wc: WebContents }>} */
  const renderers = new Map()
  let stopping = false
  let restarts = 0

  function fork() {
    const proc = utilityProcess.fork(o.enginePath, o.engineArgs, { serviceName: 'Alarm Engine', stdio: 'inherit' })
    child = proc
    proc.on('exit', (code) => {
      if (child !== proc) return
      child = null
      shellPort?.close()
      shellPort = null
      if (stopping) return
      restarts++
      o.log(`[shell] engine exited (code ${code}); restarting`)
      setTimeout(fork, RESTART_DELAY_MS)
    })

    const { port1, port2 } = new MessageChannelMain()
    proc.postMessage({ kind: ENGINE_CONTROL.attach, role: 'shell' }, [port1])
    shellPort = port2
    port2.on('message', (e) => {
      const check = checkMessage(e.data, SUBSCRIPTIONS.shell)
      if (!check.ok) {
        o.log(`[shell] dropped message: ${check.reason}`)
        return
      }
      o.onMessage(e.data)
    })
    port2.start()
    for (const r of renderers.values()) connect(r.role, r.wc)
    o.onEngineStart()
  }

  /** @param {Role} role @param {WebContents} wc */
  function connect(role, wc) {
    if (!child || wc.isDestroyed()) return
    const { port1, port2 } = new MessageChannelMain()
    child.postMessage({ kind: ENGINE_CONTROL.attach, role }, [port1])
    wc.postMessage(IPC.busPort, null, [port2])
  }

  return {
    start: fork,
    /**
     * Registers a renderer; it gets a port on every page load and after every engine restart.
     * @param {Role} role
     * @param {WebContents} wc
     */
    attach(role, wc) {
      const id = wc.id
      renderers.set(id, { role, wc })
      wc.on('did-finish-load', () => connect(role, wc))
      wc.once('destroyed', () => renderers.delete(id))
    },
    /** @param {Record<string, unknown>} msg */
    send(msg) {
      shellPort?.postMessage(msg)
    },
    stop() {
      stopping = true
      child?.kill()
    },
    pid: () => child?.pid ?? null,
    restarts: () => restarts,
    kill: () => child?.kill(),
  }
}
