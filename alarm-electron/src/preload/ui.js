/**
 * Bridge for the `ui` renderer (sandboxed, so this file runs as a plain script and cannot import modules).
 * Exposes `window.bus`: send/on over the MessagePort to the engine, plus two shell requests.
 * Channel names mirror contract/channels.js IPC (checked by test/contract).
 */
const { contextBridge, ipcRenderer } = require('electron')

const CHANNELS = {
  busPort: 'bus:port',
  pickSoundFile: 'shell:pick-sound-file',
  requestNotifications: 'shell:request-notifications',
}

/** @type {MessagePort | null} */
let port = null
/** @type {unknown[]} */
const queue = []
/** @type {Set<(msg: unknown) => void>} */
const listeners = new Set()

ipcRenderer.on(CHANNELS.busPort, (event) => {
  port?.close()
  port = event.ports[0]
  port.onmessage = (e) => {
    for (const fn of listeners) fn(e.data)
  }
  port.start()
  for (const msg of queue.splice(0)) port.postMessage(msg)
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
  pickSoundFile: () => ipcRenderer.invoke(CHANNELS.pickSoundFile),
  requestNotifications: () => ipcRenderer.invoke(CHANNELS.requestNotifications),
  platform: process.platform,
})
