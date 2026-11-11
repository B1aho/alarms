/**
 * Visual tests (TZ §8): the 36 states of docs/screens, window 1100 × 820, scale 2×, fixed time.
 * Each state is compared with its reference (≤ 1 % differing pixels outside time zones) and
 * also rendered in the other theme against a self-recorded baseline (`<name>--<theme>.png`,
 * written on the first run) — the references exist in one theme only.
 */
import { test, expect } from '@playwright/test'
import { alarmEvents, at, launch, mainWindow, settingsEvent } from '../e2e/helpers.js'
import { compareWithBaseline } from './compare.js'

const T = at(2026, 11, 10, 11, 51, 0) // Tuesday, November 10, 11:51
const T_LIGHT = at(2026, 11, 10, 11, 52, 0)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** @param {Record<string, unknown>} timer */
const timerEvent = (timer) =>
  JSON.stringify({
    type: 'TimerChanged',
    v: 1,
    at: 1,
    timer: {
      status: 'idle',
      durationMs: 300_000,
      endsAt: null,
      remainingMs: 0,
      label: '',
      sound: { kind: 'builtin', id: 'chimes' },
      recents: [],
      ...timer,
    },
  })
/** @param {Record<string, unknown>} sw */
const stopwatchEvent = (sw) =>
  JSON.stringify({ type: 'StopwatchChanged', v: 1, at: 1, stopwatch: { startedAt: null, accumulatedMs: 0, laps: [], ...sw } })

const RECENTS = [
  { durationMs: 300_000, label: '' },
  { durationMs: 1_500_000, label: 'Focus' },
  { durationMs: 630_000, label: 'Pasta' },
]
const math2 = { type: 'math', difficulty: 'medium', count: 2 }

/** @param {Record<string, any>} [over] */
const listAlarms = (over = {}) =>
  alarmEvents([
    {
      id: 'work',
      hour: 6,
      minute: 30,
      label: 'Work',
      days: [1, 2, 3, 4, 5],
      nextTriggerAt: at(2026, 11, 11, 6, 30),
      task: math2,
      ...over.work,
    },
    { id: 'gym', hour: 7, minute: 15, label: 'Gym', enabled: false, snoozeUntil: at(2026, 11, 10, 11, 57) },
    { id: 'weekend', hour: 9, minute: 0, label: 'Weekend', enabled: false, days: [0, 6] },
    {
      id: 'vitamins',
      hour: 22,
      minute: 45,
      label: 'Take vitamins',
      days: [0, 1, 2, 3, 4, 5, 6],
      nextTriggerAt: at(2026, 11, 10, 22, 45),
    },
  ])

/**
 * @typedef {object} Screen
 * @property {string} name reference file name without extension
 * @property {'dark' | 'light'} theme theme of the reference
 * @property {(theme: 'dark' | 'light') => string[]} journal
 * @property {number} [clock]
 * @property {'default' | 'granted' | 'denied'} [notifications]
 * @property {(page: import('@playwright/test').Page) => Promise<void>} [setup]
 * @property {string[]} [mask] selectors of time-dependent or random content
 * @property {boolean} [fullPage]
 */

/** @param {import('@playwright/test').Page} page */
const openAdd = async (page) => {
  await page.click('.btn-plus')
}
/** @param {import('@playwright/test').Page} page @param {string} label */
const editorPage = async (page, label) => {
  await openAdd(page)
  await page.click(`.row-button:has-text("${label}")`)
}
/** @param {import('@playwright/test').Page} page */
const toStopwatch = (page) => page.keyboard.press(`${mod}+2`)
/** @param {import('@playwright/test').Page} page */
const toTimer = (page) => page.keyboard.press(`${mod}+3`)
/** @param {import('@playwright/test').Page} page */
const toSettings = (page) => page.keyboard.press(`${mod}+4`)

const s = (/** @type {'dark' | 'light'} */ theme, /** @type {Record<string, unknown>} */ extra = {}) =>
  settingsEvent({ theme, ...extra })

/** @type {Screen[]} */
const SCREENS = [
  { name: '01-alarms-empty', theme: 'dark', journal: (t) => [s(t)] },
  { name: '02-alarms-notifications-banner', theme: 'dark', journal: (t) => [s(t)], notifications: 'default' },
  { name: '03-alarms-list', theme: 'dark', journal: (t) => [s(t), ...listAlarms()] },
  { name: '04-alarms-edit-mode', theme: 'dark', journal: (t) => [s(t), ...listAlarms()], setup: (p) => p.click('text=Edit') },
  {
    name: '05-alarms-edit-delete-confirm',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: async (p) => {
      await p.click('text=Edit')
      await p.click('[aria-label="Delete Gym"]')
    },
  },
  { name: '06-editor-add', theme: 'dark', journal: (t) => [s(t), ...listAlarms()], setup: openAdd },
  { name: '07-editor-repeat', theme: 'dark', journal: (t) => [s(t), ...listAlarms()], setup: (p) => editorPage(p, 'Repeat') },
  { name: '08-editor-sound', theme: 'dark', journal: (t) => [s(t), ...listAlarms()], setup: (p) => editorPage(p, 'Sound') },
  {
    name: '09-editor-gradual-volume',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: (p) => editorPage(p, 'Gradual Volume'),
  },
  {
    name: '10-editor-turn-off-task',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: (p) => editorPage(p, 'Turn Off With'),
    mask: ['.example-text'],
  },
  {
    name: '11-editor-turn-off-retype',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: async (p) => {
      await editorPage(p, 'Turn Off With')
      await p.click('.segmented-option:has-text("Retype Code")')
    },
    mask: ['.example-text'],
  },
  {
    name: '12-editor-turn-off-none',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: async (p) => {
      await editorPage(p, 'Turn Off With')
      await p.click('.segmented-option:has-text("None")')
    },
  },
  {
    name: '13-editor-edit-existing-bottom',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms()],
    setup: async (p) => {
      await p.click('[data-alarm-id="work"]')
      await p.locator('.sheet-body').evaluate((el) => (el.scrollTop = el.scrollHeight))
    },
  },
  { name: '14-alarms-list-12h', theme: 'dark', journal: (t) => [s(t, { hourCycle: '12h' }), ...listAlarms()] },
  { name: '15-editor-add-12h', theme: 'dark', journal: (t) => [s(t, { hourCycle: '12h' }), ...listAlarms()], setup: openAdd },
  {
    name: '16-ringing',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms({ work: { ringingSince: T - 1000 } })],
    mask: ['.ringing-time'],
  },
  {
    name: '17-ringing-task-math',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms({ work: { ringingSince: T - 1000 } })],
    setup: (p) => p.click('.ring-stop'),
    mask: ['.ringing-time', '.task-prompt'],
  },
  {
    name: '18-ringing-task-wrong-answer',
    theme: 'dark',
    journal: (t) => [s(t), ...listAlarms({ work: { ringingSince: T - 1000 } })],
    setup: async (p) => {
      await p.click('.ring-stop')
      await p.locator('.task-input').fill('1')
      await p.keyboard.press('Enter')
      await expect(p.locator('.task-prompt')).toHaveClass(/animate-shake/)
    },
    mask: ['.ringing-time', '.task-prompt'],
  },
  {
    name: '19-ringing-no-snooze',
    theme: 'dark',
    journal: (t) => [
      s(t),
      ...alarmEvents([
        {
          label: 'Early flight',
          hour: 11,
          minute: 51,
          snooze: false,
          ringingSince: T - 1000,
          task: { type: 'none', difficulty: 'easy', count: 1 },
        },
      ]),
    ],
    mask: ['.ringing-time'],
  },
  {
    name: '20-ringing-task-retype',
    theme: 'dark',
    journal: (t) => [
      s(t),
      ...alarmEvents([
        {
          label: 'Early flight',
          hour: 11,
          minute: 51,
          ringingSince: T - 1000,
          task: { type: 'retype', difficulty: 'hard', count: 1 },
        },
      ]),
    ],
    setup: (p) => p.click('.ring-stop'),
    mask: ['.ringing-time', '.task-prompt'],
  },
  { name: '21-stopwatch-idle', theme: 'dark', journal: (t) => [s(t)], setup: toStopwatch },
  {
    name: '22-stopwatch-running-laps',
    theme: 'dark',
    journal: (t) => [s(t), stopwatchEvent({ startedAt: T - 85_720, laps: [19_870, 41_150, 58_930] })],
    setup: toStopwatch,
    mask: ['.stopwatch-time', '.lap:first-child .tabular'],
  },
  {
    name: '23-stopwatch-stopped',
    theme: 'dark',
    journal: (t) => [s(t), stopwatchEvent({ accumulatedMs: 85_790, laps: [19_870, 41_150, 58_930] })],
    setup: toStopwatch,
  },
  { name: '24-timer-idle', theme: 'dark', journal: (t) => [s(t)], setup: toTimer },
  {
    name: '25-timer-idle-recents',
    theme: 'dark',
    journal: (t) => [s(t), timerEvent({ recents: RECENTS })],
    setup: toTimer,
    fullPage: true,
  },
  {
    name: '26-timer-running',
    theme: 'dark',
    clock: T + 50_000,
    journal: (t) => [
      s(t),
      timerEvent({
        status: 'running',
        durationMs: 630_000,
        endsAt: at(2026, 11, 10, 11, 58),
        remainingMs: 630_000,
        label: 'Pasta',
        recents: RECENTS,
      }),
    ],
    setup: toTimer,
    mask: ['.countdown-time', '.countdown-ring'],
  },
  {
    name: '27-timer-paused',
    theme: 'dark',
    clock: T + 50_000,
    journal: (t) => [
      s(t),
      timerEvent({ status: 'paused', durationMs: 630_000, remainingMs: 370_000, label: 'Pasta', recents: RECENTS }),
    ],
    setup: toTimer,
  },
  {
    name: '28-timer-sound-sheet',
    theme: 'dark',
    clock: T + 50_000,
    journal: (t) => [
      s(t),
      timerEvent({ status: 'paused', durationMs: 630_000, remainingMs: 370_000, label: 'Pasta', recents: RECENTS }),
    ],
    setup: async (p) => {
      await toTimer(p)
      await p.click('text=When Timer Ends')
    },
  },
  {
    name: '29-timer-done',
    theme: 'dark',
    journal: (t) => [s(t), timerEvent({ status: 'ringing', durationMs: 600_000, label: 'Pasta', recents: RECENTS })],
    setup: toTimer,
  },
  {
    name: '30-settings',
    theme: 'dark',
    clock: T + 60_000,
    journal: (t) => [s(t)],
    setup: toSettings,
    // RELIABILITY differs by design (TZ §3.3–3.6): "Alarm Sound" → "Open at Login", new footer.
    mask: ['.section:has(.section-header:text-is("RELIABILITY")) .row:nth-child(2)'],
  },
  {
    name: '31-settings-default-sound',
    theme: 'dark',
    clock: T + 60_000,
    journal: (t) => [s(t)],
    setup: async (p) => {
      await toSettings(p)
      await p.click('.row-button:has-text("Sound")')
    },
  },
  { name: '32-light-alarms-list', theme: 'light', clock: T_LIGHT, journal: (t) => [s(t), ...listAlarms()] },
  { name: '33-light-editor', theme: 'light', clock: T_LIGHT, journal: (t) => [s(t), ...listAlarms()], setup: openAdd },
  { name: '34-light-timer', theme: 'light', clock: T_LIGHT, journal: (t) => [s(t)], setup: toTimer },
  { name: '35-light-stopwatch', theme: 'light', clock: T_LIGHT, journal: (t) => [s(t)], setup: toStopwatch },
  {
    name: '36-light-settings',
    theme: 'light',
    clock: T_LIGHT,
    journal: (t) => [s(t)],
    setup: toSettings,
    mask: ['.section:has(.section-header:text-is("RELIABILITY")) .row:nth-child(2)'],
  },
]

const TIME_ZONES = ['.topbar-clock']

for (const sc of SCREENS) {
  for (const theme of /** @type {const} */ (['dark', 'light'])) {
    const reference = theme === sc.theme
    test(`${sc.name} — ${theme}${reference ? ' (reference)' : ''}`, async () => {
      const { app } = await launch({
        clock: sc.clock ?? T,
        journal: sc.journal(theme),
        notifications: sc.notifications ?? 'granted',
        env: { ALARM_TEST_DSF: '2', ALARM_TEST_KEEP_BOUNDS: '1' },
      })
      try {
        const page = await mainWindow(app)
        await page.waitForTimeout(300)
        if (sc.setup) await sc.setup(page)
        await page.mouse.move(1099, 819)
        await page.waitForTimeout(700)
        const shot = await page.screenshot({
          scale: 'device',
          fullPage: sc.fullPage ?? false,
          animations: 'disabled',
          caret: 'hide',
        })
        /** @type {Array<{ x: number, y: number, width: number, height: number }>} */
        const masks = []
        for (const sel of [...TIME_ZONES, ...(sc.mask ?? [])]) {
          for (const box of await page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
            masks.push({ x: (box.x + 0) * 2, y: box.y * 2, width: box.width * 2, height: box.height * 2 })
          }
        }
        const res = compareWithBaseline(reference ? `${sc.name}.png` : `${sc.name}--${theme}.png`, shot, masks)
        test.info().annotations.push({
          type: 'diff',
          description: `${(res.ratio * 100).toFixed(3)} %${res.created ? ' (baseline created)' : ''}`,
        })
        console.log(
          `[visual] ${sc.name} ${theme}: ${res.sizeMismatch ?? `${(res.ratio * 100).toFixed(3)} %`}${res.created ? ' (baseline created)' : ''}`,
        )
        expect(res.sizeMismatch ?? null).toBeNull()
        expect(res.ratio).toBeLessThanOrEqual(0.01)
      } finally {
        await app.close()
      }
    })
  }
}
