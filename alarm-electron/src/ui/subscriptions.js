/**
 * Subscriptions (what the window listens to, derived from the model) and the effect interpreter.
 * The only place in the UI that touches `window.bus`, timers and global listeners.
 */

import { SUBSCRIPTIONS } from '../contract/channels.js'
import { checkMessage } from '../contract/schemas/validate.js'
import { keyInfo, keyToMsg } from './keyboard.js'
import { ringingAlarm, timerActive } from './model.js'

/** @typedef {import('./model.js').Model} Model */
/** @typedef {import('./kernel/runtime.js').Sub} Sub */
/** @typedef {(msg: any) => void} Dispatch */

/**
 * @typedef {object} Bus
 * @property {(msg: unknown) => void} send
 * @property {(fn: (msg: any) => void) => () => void} on
 * @property {() => Promise<{ path: string, name: string } | null>} pickSoundFile
 * @property {() => Promise<void>} requestNotifications
 * @property {string} platform
 */

/** @returns {Bus} */
export const getBus = () => /** @type {any} */ (window).bus

/**
 * @param {Model} m
 * @returns {Sub[]}
 */
export function subscriptions(m) {
  /** @type {Sub[]} */
  const subs = [
    { id: 'bus' },
    { id: 'clock', ms: m.route === 'timer' && timerActive(m) ? 250 : 1000 },
    { id: 'theme' },
    { id: 'keys', route: m.route, modal: Boolean(m.editor || m.sheet), ringing: Boolean(ringingAlarm(m)), platform: m.platform },
  ]
  if (m.route === 'stopwatch' && m.app?.stopwatch.startedAt !== null && m.app?.stopwatch.startedAt !== undefined)
    subs.push({ id: 'frame' })
  return subs
}

/**
 * @param {Sub} sub
 * @param {Dispatch} dispatch
 * @returns {() => void}
 */
export function startSub(sub, dispatch) {
  switch (sub.id) {
    case 'bus':
      return getBus().on((msg) => {
        const check = checkMessage(msg, SUBSCRIPTIONS.ui)
        if (!check.ok) {
          console.warn(`[ui] dropped message: ${check.reason}`)
          return
        }
        if (msg.type === 'StateProjected') dispatch({ type: 'Projection', state: msg.state })
      })
    case 'clock': {
      const t = setInterval(() => dispatch({ type: 'Tick', now: Date.now() }), sub.ms)
      return () => clearInterval(t)
    }
    case 'frame': {
      let raf = requestAnimationFrame(function loop() {
        dispatch({ type: 'Frame', now: Date.now() })
        raf = requestAnimationFrame(loop)
      })
      return () => cancelAnimationFrame(raf)
    }
    case 'theme': {
      const mq = matchMedia('(prefers-color-scheme: dark)')
      const on = () => dispatch({ type: 'SystemTheme', dark: mq.matches })
      mq.addEventListener('change', on)
      return () => mq.removeEventListener('change', on)
    }
    case 'keys': {
      /** @param {KeyboardEvent} e */
      const on = (e) => {
        const res = keyToMsg(keyInfo(e), { route: sub.route, modal: sub.modal, ringing: sub.ringing, platform: sub.platform })
        if (!res) return
        if (res.prevent) e.preventDefault()
        dispatch(res.msg)
      }
      window.addEventListener('keydown', on)
      return () => window.removeEventListener('keydown', on)
    }
  }
  return () => {}
}

/**
 * @param {import('./update.js').Effect} fx
 * @param {Dispatch} dispatch
 */
export function runEffect(fx, dispatch) {
  const bus = getBus()
  switch (fx.type) {
    case 'send':
      bus.send(fx.msg)
      return
    case 'pickFile':
      void bus.pickSoundFile().then(
        (file) => dispatch({ type: 'FilePicked', target: fx.target, file }),
        () => dispatch({ type: 'FilePicked', target: fx.target, file: null }),
      )
      return
    case 'requestNotifications':
      void bus.requestNotifications()
      return
    case 'focus':
      setTimeout(() => /** @type {HTMLElement | null} */ (document.querySelector(fx.selector))?.focus(), 0)
  }
}
