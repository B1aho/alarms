/* global window */
/**
 * Shared helpers for e2e and visual tests: launch the app in test mode with an isolated data folder,
 * a fake start time, and access to the main/audio windows and the main-process test hooks.
 */
import { _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** @param {string} [prefix] */
export const tempDir = (prefix = 'alarm-e2e-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

/**
 * @typedef {object} LaunchOptions
 * @property {string} [dataDir] reuse a data folder (restart scenarios)
 * @property {number} [clock] engine start time (ms epoch)
 * @property {'default' | 'granted' | 'denied'} [notifications]
 * @property {boolean} [hidden] start in the tray without a window
 * @property {Record<string, string>} [env]
 * @property {string[]} [journal] journal lines to seed before the first launch
 */

/** @param {LaunchOptions} [o] */
export async function launch(o = {}) {
  const dataDir = o.dataDir ?? tempDir()
  if (o.journal) fs.writeFileSync(path.join(dataDir, 'journal.jsonl'), o.journal.join('\n') + '\n')
  /** @type {Record<string, string>} */
  const env = { ...process.env, ALARM_TEST: '1', ALARM_USER_DATA: dataDir, ...o.env }
  delete env.ELECTRON_RUN_AS_NODE
  if (o.clock) env.ALARM_TEST_CLOCK = String(o.clock)
  env.ALARM_TEST_NOTIFICATIONS = o.notifications ?? 'granted'
  if (o.hidden) env.ALARM_START_HIDDEN = '1'
  const app = await electron.launch({ args: [ROOT], cwd: ROOT, env })
  /** @type {string[]} */
  const logs = []
  app.process().stdout?.on('data', (d) => logs.push(String(d)))
  app.process().stderr?.on('data', (d) => logs.push(String(d)))
  return { app, dataDir, logs }
}

/**
 * The main window page (waits for it and for the first engine snapshot).
 * @param {import('@playwright/test').ElectronApplication} app
 */
export async function mainWindow(app, timeout = 15_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const page = app.windows().find((p) => /\/ui\/(index|gallery)\.html/.test(p.url()))
    if (page) {
      await page.waitForSelector('html[data-ready]', { timeout: Math.max(1000, deadline - Date.now()) })
      return page
    }
    if (Date.now() > deadline) throw new Error('main window did not open')
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** @param {import('@playwright/test').ElectronApplication} app */
export async function audioWindow(app, timeout = 15_000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const page = app.windows().find((p) => p.url().includes('/audio/index.html'))
    if (page) {
      try {
        await page.waitForFunction(() => Boolean(/** @type {any} */ (window).__audio), null, { timeout: 2000 })
        return page
      } catch {
        // re-created after a crash: look again
      }
    }
    if (Date.now() > deadline) throw new Error('audio window not found')
    await new Promise((r) => setTimeout(r, 100))
  }
}

/**
 * Calls a test hook in the main process.
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {string} name
 * @param {unknown[]} args
 */
export function hook(app, name, ...args) {
  return app.evaluate(
    (_electron, [n, a]) => /** @type {any} */ (globalThis).__alarm[/** @type {string} */ (n)](.../** @type {unknown[]} */ (a)),
    [name, args],
  )
}

/** @param {() => Promise<boolean> | boolean} fn */
export async function waitFor(fn, timeout = 10_000, step = 100) {
  const deadline = Date.now() + timeout
  for (;;) {
    // Errors (e.g. test hooks not installed yet) count as "not yet".
    if (
      await Promise.resolve()
        .then(fn)
        .catch(() => false)
    )
      return
    if (Date.now() > deadline) throw new Error('waitFor: timed out')
    await new Promise((r) => setTimeout(r, step))
  }
}

/** Local time helper. */
export const at = (/** @type {number} */ y, /** @type {number} */ mo, /** @type {number} */ d, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime()

/**
 * Journal lines that create alarms directly (fixtures).
 * @param {Array<Partial<import('../../src/contract/events.js').Alarm>>} alarms
 */
export function alarmEvents(alarms) {
  return alarms.map((a, i) =>
    JSON.stringify({
      type: 'AlarmSaved',
      v: 1,
      at: 1,
      alarm: {
        id: `fx${i}`,
        hour: 7,
        minute: 30,
        label: '',
        enabled: true,
        days: [],
        sound: { kind: 'builtin', id: 'sunrise' },
        volume: 0.9,
        rampSeconds: 60,
        snooze: true,
        task: { type: 'math', difficulty: 'medium', count: 2 },
        createdAt: i + 1,
        nextTriggerAt: null,
        snoozeUntil: null,
        ringingSince: null,
        ...a,
      },
    }),
  )
}

/** @param {Record<string, unknown>} settings */
export const settingsEvent = (settings) =>
  JSON.stringify({
    type: 'SettingsChanged',
    v: 1,
    at: 1,
    settings: {
      theme: 'dark',
      hourCycle: '24h',
      snoozeMinutes: 9,
      rampSeconds: 60,
      volume: 0.9,
      defaultSound: { kind: 'builtin', id: 'sunrise' },
      defaultTask: { type: 'math', difficulty: 'medium', count: 2 },
      keepAwake: false,
      missedGraceMinutes: 60,
      openAtLogin: true,
      ...settings,
    },
  })
