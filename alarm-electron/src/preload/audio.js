/**
 * Bridge for the hidden `audio` renderer (sandboxed: plain script, no module imports).
 * Exposes `window.bus`: send/on over the MessagePort to the engine and `onReconnect`
 * (a new port means the engine restarted). Channel name mirrors contract/channels.js IPC.busPort.
 */
const { contextBridge, ipcRenderer } = require('electron')

const BUS_PORT = 'bus:port'

/** @type {MessagePort | null} */
let port = null
/** @type {unknown[]} */
const queue = []
/** @type {Set<(msg: unknown) => void>} */
const listeners = new Set()
/** @type {Set<() => void>} */
const reconnectListeners = new Set()
let connections = 0

ipcRenderer.on(BUS_PORT, (event) => {
  port?.close()
  port = event.ports[0]
  port.onmessage = (e) => {
    for (const fn of listeners) fn(e.data)
  }
  port.start()
  for (const msg of queue.splice(0)) port.postMessage(msg)
  if (connections++ > 0) for (const fn of reconnectListeners) fn()
})

contextBridge.exposeInMainWorld('bus', {
  /** @param {unknown} msg */
  send(msg) {
    if (port) port.postMessage(msg)
    else queue.push(msg)
  },
  /** @param {(msg: unknown) => void} fn */
  on(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** @param {() => void} fn */
  onReconnect(fn) {
    reconnectListeners.add(fn)
    return () => reconnectListeners.delete(fn)
  },
})
