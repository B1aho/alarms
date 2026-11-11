/**
 * System notifications (ALARM_SPEC §3.14, TZ §3.8, §3.9, §3.11). Texts come from the engine.
 *  - never disappear by themselves: macOS `timeoutType: 'never'`, Windows toast `scenario="alarm"`;
 *  - Snooze button on macOS and Windows; none on Linux (Electron has no actions there) — it is in the tray menu;
 *  - permission: macOS reports it from `com.apple.ncprefs`; Windows and Linux are always "On".
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app, Notification } from 'electron'
import { QUIET } from './windows.js'

/** Windows toast buttons use protocol activation: `alarm-action://snooze/<alarmId>`. */
export const ACTION_PROTOCOL = 'alarm-action'

/** @typedef {'default' | 'granted' | 'denied'} Permission */
/**
 * @typedef {{ type: 'NotificationRequested', tag: string, kind: string, title: string, body: string, snooze: { alarmId: string, label: string } | null }} Request
 */

/** @param {string} s */
const xmlEscape = (s) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * @param {object} o
 * @param {() => void} o.onClick
 * @param {(alarmId: string) => void} o.onSnooze
 * @param {(msg: string) => void} o.log
 */
export function createNotifications(o) {
  const platform = process.platform
  /** @type {Map<string, Notification>} */
  const active = new Map()
  /** Tests never post real OS notifications (see QUIET in windows.js). @type {Set<string>} */
  const quietTags = new Set()
  /** Requests shown, for tests. @type {Request[]} */
  const history = []

  /** @param {Request} req */
  function show(req) {
    close(req.tag)
    history.push(req)
    if (QUIET) {
      quietTags.add(req.tag)
      return
    }
    if (!Notification.isSupported()) return
    const snooze = req.snooze && platform !== 'linux' ? req.snooze : null
    /** @type {Electron.NotificationConstructorOptions} */
    const options = {
      title: req.title,
      body: req.body,
      silent: true, // the app plays its own sound
      timeoutType: 'never',
      urgency: req.kind === 'alarm' || req.kind === 'timer' ? 'critical' : 'normal',
      actions: snooze ? [{ type: 'button', text: snooze.label }] : [],
    }
    if (platform === 'win32') {
      const actions = snooze
        ? `<actions><action content="${xmlEscape(snooze.label)}" activationType="protocol" arguments="${ACTION_PROTOCOL}://snooze/${xmlEscape(snooze.alarmId)}"/></actions>`
        : ''
      const scenario = req.kind === 'alarm' || req.kind === 'timer' ? ' scenario="alarm"' : ''
      options.toastXml =
        `<toast${scenario}><visual><binding template="ToastGeneric"><text>${xmlEscape(req.title)}</text>` +
        req.body
          .split('\n')
          .map((l) => `<text>${xmlEscape(l)}</text>`)
          .join('') +
        `</binding></visual>${actions}<audio silent="true"/></toast>`
    }
    const n = new Notification(options)
    n.on('click', () => o.onClick())
    n.on('action', (_e, index) => {
      if (snooze && index === 0) o.onSnooze(snooze.alarmId)
    })
    n.on('close', () => {
      if (active.get(req.tag) === n) active.delete(req.tag)
    })
    n.on('failed', (_e, error) => o.log(`[shell] notification failed: ${error}`))
    active.set(req.tag, n)
    n.show()
  }

  /** @param {string} tag */
  function close(tag) {
    quietTags.delete(tag)
    const n = active.get(tag)
    if (n) {
      active.delete(tag)
      n.close()
    }
  }

  return {
    show,
    close,
    history: () => history,
    activeTags: () => [...active.keys(), ...quietTags],
    /** Windows protocol activation of a toast button. @param {string[]} argv */
    handleArgv(argv) {
      const url = argv.find((a) => a.startsWith(`${ACTION_PROTOCOL}://snooze/`))
      if (url) o.onSnooze(url.slice(`${ACTION_PROTOCOL}://snooze/`.length).replace(/\/$/, ''))
    },
  }
}

/** Bundle id of the running app (dev: Electron.app; packaged: com.example.alarm). */
function macBundleId() {
  try {
    const plist = fs.readFileSync(path.join(path.dirname(app.getPath('exe')), '..', 'Info.plist'), 'utf8')
    return /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * macOS: reads the Notification Center preferences. No entry → never asked ("default");
 * the "allow notifications" bit (1 << 25) of `flags` → granted, otherwise denied.
 * Windows and Linux do not ask: always "granted".
 * @returns {Promise<Permission>}
 */
export function readPermission() {
  if (process.platform !== 'darwin') return Promise.resolve('granted')
  const id = macBundleId()
  if (!id) return Promise.resolve('default')
  return new Promise((resolve) => {
    execFile('/usr/bin/defaults', ['export', 'com.apple.ncprefs', '-'], { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve('default')
      for (const dict of stdout.split('<dict>')) {
        if (!dict.includes(`<string>${id}</string>`) || !/<key>bundle-id<\/key>/.test(dict)) continue
        const m = /<key>flags<\/key>\s*<integer>(\d+)<\/integer>/.exec(dict)
        if (!m) return resolve('default')
        return resolve((Number(m[1]) & (1 << 25)) !== 0 ? 'granted' : 'denied')
      }
      resolve('default')
    })
  })
}

/**
 * Asks macOS for permission: the first notification triggers the system prompt.
 * @param {string} title
 */
export function requestPermission(title) {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, silent: true })
  n.show()
  setTimeout(() => n.close(), 1500)
}
