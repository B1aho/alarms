/* global window */
/**
 * TZ §7 reliability scenarios on the real app (Playwright `_electron`, test clock).
 */
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { alarmEvents, at, audioWindow, hook, launch, mainWindow, ROOT, settingsEvent, waitFor } from './helpers.js'

const T = at(2026, 11, 10, 7, 29, 50) // Tue 07:29:50, alarm at 07:30
const alarm = (/** @type {any} */ patch = {}) =>
  alarmEvents([
    {
      hour: 7,
      minute: 30,
      label: 'Work',
      nextTriggerAt: at(2026, 11, 10, 7, 30),
      task: { type: 'none', difficulty: 'easy', count: 1 },
      ...patch,
    },
  ])

/** @param {import('@playwright/test').Page} audio */
const audioKeys = (audio) => audio.evaluate(() => /** @type {any} */ (window).__audio.keys())

/** @param {number} pid */
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test('stage 1: processes exchange Ping over the bus', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    const pong = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const bus = /** @type {any} */ (window).bus
          const off = bus.on((/** @type {any} */ m) => {
            if (m.type === 'Pong') {
              off()
              resolve(m)
            }
          })
          bus.send({ type: 'Ping', from: 'ui', seq: 7 })
        }),
    )
    expect(pong).toEqual({ type: 'Pong', from: 'engine', seq: 7 })
  } finally {
    await app.close()
  }
})

test('window closed: rings within 1 s, notification, window on top of everything', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({}), ...alarm()] })
  try {
    await mainWindow(app)
    const audio = await audioWindow(app)
    await hook(app, 'closeMain')
    await waitFor(async () => (await hook(app, 'mainWindow')) === null)
    // Jump to 0.3 s before the alarm; it must sound no later than 1 s after its time.
    await hook(app, 'setClock', at(2026, 11, 10, 7, 29, 59) + 700)
    const t0 = Date.now()
    await waitFor(async () => (await audioKeys(audio)).length > 0, 3000, 25)
    expect(Date.now() - t0).toBeLessThan(1300)
    expect((await audioKeys(audio))[0]).toMatch(/^alarm:/)
    await waitFor(
      async () =>
        (await audio.evaluate(() =>
          /** @type {any} */ (window).__audio.elapsed(/** @type {any} */ (window).__audio.keys()[0]),
        )) !== null,
    )
    const notes = /** @type {any[]} */ (await hook(app, 'notifications'))
    expect(notes.at(-1)).toMatchObject({
      title: '⏰ Work',
      body: '07:30\nOpen the app to turn it off.',
      snooze: { label: 'Snooze 9 min' },
    })
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow'))?.visible === true)
    const win = /** @type {any} */ (await hook(app, 'mainWindow'))
    expect(win.visible).toBe(true)
    expect(win.alwaysOnTop).toBe(true)
    expect(win.title).toBe('⏰ Work')
    const page = await mainWindow(app)
    await expect(page.locator('.ringing')).toBeVisible()
    await expect(page.locator('.ringing-label')).toHaveText('Work')
    expect(await hook(app, 'trayLabels')).toEqual(['Open Alarm', 'Snooze 9 min', '—', 'Quit'])
    // Stop (no task) → silence, title restored, tray without Snooze
    await page.click('.ring-stop')
    await waitFor(async () => (await audioKeys(audio)).length === 0)
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow')).title === 'Alarm')
    expect(await hook(app, 'trayLabels')).toEqual(['Open Alarm', '—', 'Quit'])
    expect(/** @type {any} */ (await hook(app, 'mainWindow')).alwaysOnTop).toBe(false)
  } finally {
    await app.close()
  }
})

test('Snooze from the tray menu (and the notification action) without opening the window', async () => {
  const { app } = await launch({ clock: at(2026, 11, 10, 7, 30, 1), journal: [settingsEvent({}), ...alarm()], hidden: true })
  try {
    const audio = await audioWindow(app)
    await waitFor(async () => (await audioKeys(audio)).length > 0)
    await waitFor(async () => /** @type {string[]} */ (await hook(app, 'trayLabels')).includes('Snooze 9 min'))
    await hook(app, 'trayClick', 'snooze')
    await waitFor(async () => (await audioKeys(audio)).length === 0)
    expect(await hook(app, 'activeNotifications')).toEqual([])
    // the snoozed alarm rings again after 9 minutes
    await hook(app, 'setClock', at(2026, 11, 10, 7, 39, 2))
    await waitFor(async () => (await audioKeys(audio)).length > 0)
  } finally {
    await app.close()
  }
})

test('ringing survives Quit from the tray and a restart (ringingSince in the journal)', async () => {
  const first = await launch({ clock: at(2026, 11, 10, 7, 30, 1), journal: [settingsEvent({}), ...alarm({ label: 'Gym' })] })
  const audio = await audioWindow(first.app)
  await waitFor(async () => (await audioKeys(audio)).length > 0)
  const closed = first.app.waitForEvent('close')
  await hook(first.app, 'trayClick', 'quit')
  await closed
  const lines = fs.readFileSync(path.join(first.dataDir, 'journal.jsonl'), 'utf8').trim().split('\n')
  expect(lines.filter((l) => l.includes('"AlarmRang"'))).toHaveLength(1)

  const second = await launch({ dataDir: first.dataDir, clock: at(2026, 11, 10, 7, 31) })
  try {
    const audio2 = await audioWindow(second.app)
    await waitFor(async () => (await audioKeys(audio2)).length > 0)
    const page = await mainWindow(second.app)
    await expect(page.locator('.ringing-label')).toHaveText('Gym')
    const after = fs.readFileSync(path.join(first.dataDir, 'journal.jsonl'), 'utf8').trim().split('\n')
    expect(after.filter((l) => l.includes('"AlarmRang"'))).toHaveLength(1) // still exactly once
  } finally {
    await second.app.close()
  }
})

test('app killed during ringing: engine dies with it, ringing continues after relaunch', async () => {
  const first = await launch({ clock: at(2026, 11, 10, 7, 30, 1), journal: [settingsEvent({}), ...alarm({ label: 'Gym' })] })
  const audio = await audioWindow(first.app)
  await waitFor(async () => (await audioKeys(audio)).length > 0)
  const enginePid = /** @type {number} */ (await hook(first.app, 'enginePid'))
  first.app.process().kill('SIGKILL')
  await waitFor(() => !alive(enginePid), 5000)
  const second = await launch({ dataDir: first.dataDir, clock: at(2026, 11, 10, 7, 31) })
  try {
    const audio2 = await audioWindow(second.app)
    await waitFor(async () => (await audioKeys(audio2)).length > 0)
  } finally {
    await second.app.close()
  }
})

test('engine crash: restarted within 2 s, state from the journal, alarm keeps ringing', async () => {
  const { app } = await launch({ clock: at(2026, 11, 10, 7, 30, 1), journal: [settingsEvent({}), ...alarm()] })
  try {
    const audio = await audioWindow(app)
    const page = await mainWindow(app)
    await waitFor(async () => (await audioKeys(audio)).length > 0)
    const pid = await hook(app, 'enginePid')
    await hook(app, 'killEngine')
    const t0 = Date.now()
    await waitFor(
      async () => {
        const p = await hook(app, 'enginePid')
        return p !== null && p !== pid
      },
      5000,
      50,
    )
    expect(Date.now() - t0).toBeLessThan(2000)
    // the sound never stopped; the new engine confirms it
    await new Promise((r) => setTimeout(r, 2500))
    expect(await audioKeys(audio)).toHaveLength(1)
    // UI reconnected and still shows the ringing alarm
    await expect(page.locator('.ringing-label')).toHaveText('Work')
    await page.click('.ring-stop')
    await waitFor(async () => (await audioKeys(audio)).length === 0)
  } finally {
    await app.close()
  }
})

test('audio renderer crash: re-created and the engine re-sends PlaySound', async () => {
  const { app } = await launch({ clock: at(2026, 11, 10, 7, 30, 1), journal: [settingsEvent({}), ...alarm()] })
  try {
    const audio = await audioWindow(app)
    await waitFor(async () => (await audioKeys(audio)).length > 0)
    await hook(app, 'crashAudio').catch(() => {})
    await waitFor(async () => (await hook(app, 'audioRestarts')) === 1)
    await waitFor(() => audio.isClosed())
    await waitFor(async () => {
      try {
        const fresh = await audioWindow(app, 2000)
        return (await audioKeys(fresh)).length > 0
      } catch {
        return false
      }
    }, 10_000)
  } finally {
    await app.close()
  }
})

test('second launch: the new process exits and the first one shows its window', async () => {
  const { app, dataDir } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    await mainWindow(app)
    await hook(app, 'closeMain')
    await waitFor(async () => (await hook(app, 'mainWindow')) === null)
    const electronBin = /** @type {string} */ (createRequire(import.meta.url)('electron'))
    const second = spawn(electronBin, [ROOT], {
      env: { ...process.env, ALARM_TEST: '1', ALARM_USER_DATA: dataDir },
      stdio: 'ignore',
    })
    const code = await new Promise((resolve) => second.on('exit', resolve))
    expect(code).toBe(0)
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow'))?.visible === true)
  } finally {
    await app.close()
  }
})

test('computer slept: late within grace rings; beyond grace → Missed alarm notification, schedule moved', async () => {
  const { app } = await launch({
    clock: at(2026, 11, 10, 7, 0),
    journal: [
      settingsEvent({ missedGraceMinutes: 15 }),
      ...alarmEvents([
        { id: 'late', hour: 7, minute: 30, label: 'Late', days: [0, 1, 2, 3, 4, 5, 6], nextTriggerAt: at(2026, 11, 10, 7, 30) },
        {
          id: 'ok',
          hour: 9,
          minute: 0,
          label: 'Ok',
          nextTriggerAt: at(2026, 11, 10, 9, 0),
          task: { type: 'none', difficulty: 'easy', count: 1 },
        },
      ]),
    ],
  })
  try {
    const audio = await audioWindow(app)
    await mainWindow(app)
    // "sleep" until 08:00: 30 min late > 15 min grace
    await hook(app, 'setClock', at(2026, 11, 10, 8, 0))
    await waitFor(async () =>
      /** @type {any[]} */ (await hook(app, 'notifications')).some((n) => n.title === 'Missed alarm: Late'),
    )
    const n = /** @type {any[]} */ (await hook(app, 'notifications')).find((x) => x.title === 'Missed alarm: Late')
    expect(n.body).toBe('It was set for 07:30, while the computer was asleep or the app was closed.')
    expect(await audioKeys(audio)).toEqual([])
    // "sleep" until 09:10: 10 min late ≤ grace → rings at once
    await hook(app, 'setClock', at(2026, 11, 10, 9, 10))
    await waitFor(async () => (await audioKeys(audio)).length === 1)
  } finally {
    await app.close()
  }
})

test('a broken journal line is skipped; the rest loads and the app works', async () => {
  const { app } = await launch({
    clock: T,
    journal: [
      settingsEvent({}),
      '{"type":"AlarmSaved", broken',
      ...alarm({ label: 'Survivor' }),
      'garbage',
      '{"type":"Nope","v":1,"at":1}',
    ],
  })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.alarm-row')).toHaveCount(1)
    await expect(page.locator('.alarm-subtitle')).toHaveText('Survivor')
  } finally {
    await app.close()
  }
})

test('Keep Computer Awake blocks system sleep only with an active alarm', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({ keepAwake: true }), ...alarm()] })
  try {
    const page = await mainWindow(app)
    await waitFor(async () => (await hook(app, 'keepAwake')) === true)
    await page.locator('.alarm-row .switch').click()
    await waitFor(async () => (await hook(app, 'keepAwake')) === false)
  } finally {
    await app.close()
  }
})

test('started from the login item: hidden in the tray, the alarm still rings', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({}), ...alarm()], hidden: true })
  try {
    const audio = await audioWindow(app)
    expect(await hook(app, 'mainWindow')).toBeNull()
    await hook(app, 'setClock', at(2026, 11, 10, 7, 30, 0) + 100)
    await waitFor(async () => (await audioKeys(audio)).length > 0)
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow'))?.visible === true)
  } finally {
    await app.close()
  }
})

test('real clock (no test offset): window closed, the alarm sounds within 1 s of its time', async () => {
  const trigger = Date.now() + 6000
  const d = new Date(trigger)
  const { app } = await launch({
    journal: [
      settingsEvent({}),
      ...alarmEvents([
        {
          hour: d.getHours(),
          minute: d.getMinutes(),
          label: 'Real',
          nextTriggerAt: trigger,
          task: { type: 'none', difficulty: 'easy', count: 1 },
        },
      ]),
    ],
  })
  try {
    await mainWindow(app)
    const audio = await audioWindow(app)
    await hook(app, 'closeMain')
    await waitFor(async () => (await hook(app, 'mainWindow')) === null)
    expect(Date.now()).toBeLessThan(trigger)
    await waitFor(async () => (await audioKeys(audio)).length > 0, 10_000, 20)
    const late = Date.now() - trigger
    expect(late).toBeGreaterThanOrEqual(-50)
    expect(late).toBeLessThan(1000)
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow'))?.alwaysOnTop === true)
  } finally {
    await app.close()
  }
})

test('app was closed past the grace period: Missed alarm notification right at start', async () => {
  const { app } = await launch({
    clock: at(2026, 11, 10, 8, 0),
    journal: [
      settingsEvent({ missedGraceMinutes: 15 }),
      ...alarmEvents([{ label: 'Gone', nextTriggerAt: at(2026, 11, 10, 7, 30) }]),
    ],
    hidden: true,
  })
  try {
    await waitFor(async () =>
      /** @type {any[]} */ (await hook(app, 'notifications')).some((n) => n.title === 'Missed alarm: Gone'),
    )
  } finally {
    await app.close()
  }
})
