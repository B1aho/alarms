/* global window */
/**
 * Feature e2e (ALARM_SPEC §3): navigation and hotkeys, editor, list, ringing tasks, timer,
 * stopwatch, settings, sounds and the volume ramp.
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { alarmEvents, at, audioWindow, hook, launch, mainWindow, settingsEvent, tempDir, waitFor } from './helpers.js'

const T = at(2026, 11, 10, 11, 51, 0) // Tuesday
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

/** @param {import('@playwright/test').Page} audio */
const audioKeys = (audio) => audio.evaluate(() => /** @type {any} */ (window).__audio.keys())

test('navigation: segmented bar and ⌘/Ctrl + 1…4; clock in the bar', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.page-title')).toHaveText('Alarms')
    await expect(page.locator('.topbar-clock')).toHaveText('11:51')
    for (const [key, title] of [
      ['2', 'Stopwatch'],
      ['3', 'Timer'],
      ['4', 'Settings'],
      ['1', 'Alarms'],
    ]) {
      await page.keyboard.press(`${mod}+${key}`)
      await expect(page.locator('.page-title')).toHaveText(title)
    }
    await page.click('[data-tab="timer"]')
    await expect(page.locator('.page-title')).toHaveText('Timer')
  } finally {
    await app.close()
  }
})

test('alarms: empty state → add with the editor → list, toggle, edit, delete', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.empty-title')).toHaveText('No Alarms')
    await expect(page.locator('.page-subtitle')).toHaveText('No alarms on')
    await expect(page.locator('.btn-plus')).toHaveCount(0)
    await page.click('text=Add Alarm')
    await expect(page.locator('.sheet-title')).toHaveText('Add Alarm')
    // the time wheels start at the current time; move the minute with the keyboard (glide, then commit)
    const minute = page.locator('wheel-picker[aria-label="Minute"]')
    await expect(minute.locator('[aria-selected="true"]')).toHaveText('51')
    await minute.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(minute.locator('[aria-selected="true"]')).toHaveText('53')
    await page.fill('.inline-input', 'Work')
    await page.click('text=Repeat')
    await expect(page.locator('.sheet-title')).toHaveText('Repeat')
    for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) await page.click(`text=Every ${d}`)
    await page.click('.btn-back')
    await expect(page.locator('.row-button:has-text("Repeat") .row-detail')).toHaveText('Weekdays')
    await page.click('text=Gradual Volume')
    await page.click('.row-button:has-text("30 sec")')
    await page.click('.btn-back')
    await page.click('.row-button:has-text("Turn Off With")')
    await page.click('.segmented-option:has-text("Retype Code")')
    await page.click('.segmented-option:has-text("Hard")')
    await page.click('[aria-label="Increase"]')
    await expect(page.locator('.row:has-text("in a row") .row-label')).toHaveText('3 tasks in a row')
    await expect(page.locator('.example-text')).toHaveText(
      /^[A-HJ-NP-Z2-9]{4} [A-HJ-NP-Z2-9]{4} [A-HJ-NP-Z2-9]{4} [A-HJ-NP-Z2-9]{2}$/,
    )
    await page.click('.btn-back')
    await expect(page.locator('.row-button:has-text("Turn Off With") .row-detail')).toHaveText('Retype Code · Hard · 3×')
    await page.click('text=Save')
    await expect(page.locator('.sheet')).toHaveCount(0)
    await expect(page.locator('.alarm-clock')).toHaveText('11:53')
    await expect(page.locator('.alarm-subtitle')).toHaveText('Work, weekdays')
    await expect(page.locator('.page-subtitle')).toHaveText('Next alarm in 2 min')
    // toggle off → inactive colour, "No alarms on"; the switch does not open the editor
    await page.locator('.alarm-row .switch').click()
    await expect(page.locator('.alarm-main')).toHaveClass(/is-inactive/)
    await expect(page.locator('.page-subtitle')).toHaveText('No alarms on')
    await expect(page.locator('.sheet')).toHaveCount(0)
    // edit: Save always re-enables
    await page.click('.alarm-row')
    await expect(page.locator('.sheet-title')).toHaveText('Edit Alarm')
    await page.fill('.inline-input', 'Office')
    await page.click('text=Save')
    await expect(page.locator('.alarm-subtitle')).toHaveText('Office, weekdays')
    await expect(page.locator('.alarm-row .switch')).toHaveAttribute('aria-checked', 'true')
    // Esc and Cancel discard
    await page.click('.alarm-row')
    await page.fill('.inline-input', 'Nope')
    await page.keyboard.press('Escape')
    await expect(page.locator('.alarm-subtitle')).toHaveText('Office, weekdays')
    // edit mode: minus → Delete
    await page.click('text=Edit')
    await expect(page.locator('.btn-link.bold')).toHaveText('Done')
    await page.click('.delete-toggle')
    await expect(page.locator('.delete-toggle')).toHaveClass(/is-open/)
    await page.click('.delete-button')
    await expect(page.locator('.empty-title')).toHaveText('No Alarms')
  } finally {
    await app.close()
  }
})

test('delete from the editor; 12-hour format shows three wheels and AM/PM', async () => {
  const { app } = await launch({
    clock: T,
    journal: [
      settingsEvent({ hourCycle: '12h' }),
      ...alarmEvents([{ hour: 18, minute: 5, label: 'Dinner', nextTriggerAt: at(2026, 11, 10, 18, 5) }]),
    ],
  })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.alarm-clock')).toHaveText('6:05')
    await expect(page.locator('.alarm-period')).toHaveText('PM')
    await expect(page.locator('.topbar-clock')).toHaveText('11:51AM')
    await page.click('.alarm-row')
    await expect(page.locator('wheel-picker')).toHaveCount(3)
    await expect(page.locator('wheel-picker[aria-label="AM or PM"] [aria-selected="true"]')).toHaveText('PM')
    await page.click('text=Delete Alarm')
    await expect(page.locator('.empty-title')).toHaveText('No Alarms')
  } finally {
    await app.close()
  }
})

test('ringing: math task — wrong answer shakes and gives a new task, two right answers turn it off', async () => {
  const { app } = await launch({
    clock: at(2026, 11, 10, 7, 30, 1),
    journal: [
      settingsEvent({}),
      ...alarmEvents([
        { label: 'Work', nextTriggerAt: at(2026, 11, 10, 7, 30), task: { type: 'math', difficulty: 'medium', count: 2 } },
      ]),
    ],
  })
  try {
    const page = await mainWindow(app)
    const audio = await audioWindow(app)
    await expect(page.locator('.ringing')).toBeVisible()
    await expect(page.locator('.ring-snooze')).toBeFocused()
    await expect(page.locator('.ring-snooze')).toHaveText('Snooze · 9 min')
    await expect(page.locator('.ringing-date')).toHaveText('Tuesday, November 10')
    await page.click('.ring-stop')
    await expect(page.locator('.task-card')).toBeVisible()
    await expect(page.locator('.task-input')).toBeFocused()
    await expect(page.locator('.task-done')).toBeDisabled()
    const prompt1 = await page.locator('.task-prompt').innerText()
    await page.keyboard.type('1')
    await page.keyboard.press('Enter')
    await expect(page.locator('.task-prompt')).toHaveClass(/animate-shake/)
    await expect(page.locator('.task-prompt')).not.toHaveText(prompt1)
    await expect(page.locator('.task-input')).toHaveValue('')
    for (let i = 0; i < 2; i++) {
      const text = (await page.locator('.task-prompt').innerText()).replace(' =', '')
      const [a, b, c] = text.split(/ [×+] /).map(Number)
      await page.fill('.task-input', String(a * b + c))
      await page.click('.task-done')
      if (i === 0) await expect(page.locator('.task-dot.is-solved')).toHaveCount(1)
    }
    await expect(page.locator('.ringing')).toHaveCount(0)
    await waitFor(async () => (await audioKeys(audio)).length === 0)
  } finally {
    await app.close()
  }
})

test('ringing: retype code task and Back; no snooze → focus on Stop', async () => {
  const { app } = await launch({
    clock: at(2026, 11, 10, 7, 30, 1),
    journal: [
      settingsEvent({}),
      ...alarmEvents([
        {
          label: 'Code',
          snooze: false,
          nextTriggerAt: at(2026, 11, 10, 7, 30),
          task: { type: 'retype', difficulty: 'easy', count: 1 },
        },
      ]),
    ],
  })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.ring-snooze')).toHaveCount(0)
    await expect(page.locator('.ring-stop')).toBeFocused()
    await page.click('.ring-stop')
    await expect(page.locator('.task-head span').first()).toHaveText('Type the code to turn off')
    await page.click('.task-back')
    await expect(page.locator('.task-card')).toHaveCount(0)
    await page.click('.ring-stop')
    const code = await page.locator('.task-prompt').innerText()
    await page.fill('.task-input', code.toLowerCase())
    await page.keyboard.press('Enter')
    await expect(page.locator('.ringing')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('snooze from the ringing screen; the list shows "Snoozed until" with Stop', async () => {
  const { app } = await launch({
    clock: at(2026, 11, 10, 7, 30, 1),
    journal: [settingsEvent({}), ...alarmEvents([{ label: 'Gym', nextTriggerAt: at(2026, 11, 10, 7, 30) }])],
  })
  try {
    const page = await mainWindow(app)
    await page.click('.ring-snooze')
    await expect(page.locator('.ringing')).toHaveCount(0)
    await expect(page.locator('.alarm-snoozed')).toContainText('Snoozed until 07:39')
    await expect(page.locator('.alarm-main')).not.toHaveClass(/is-inactive/) // one-shot, off, but snoozed → active
    await expect(page.locator('.page-subtitle')).toHaveText('Next alarm in 9 min')
    await page.click('.snooze-stop')
    await expect(page.locator('.alarm-snoozed')).toHaveCount(0)
    await expect(page.locator('.page-subtitle')).toHaveText('No alarms on')
  } finally {
    await app.close()
  }
})

test('timer: wheels, start, ring, pause, resume, cancel, recents, alert with Stop/Repeat', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    const audio = await audioWindow(app)
    await page.keyboard.press(`${mod}+3`)
    await expect(page.locator('.wheel-unit')).toHaveText(['hours', 'min', 'sec'])
    await expect(page.locator('.btn-circle:has-text("Cancel")')).toBeDisabled()
    // 5 min default → set 0:00:03 with the keyboard
    const min = page.locator('wheel-picker[aria-label="Minutes"]')
    await min.focus()
    await page.keyboard.press('Home')
    await expect(min.locator('[aria-selected="true"]')).toHaveText('0')
    // 0:00:00 is not allowed: the duration snaps to the 1-second minimum
    const sec = page.locator('wheel-picker[aria-label="Seconds"]')
    await expect(sec.locator('[aria-selected="true"]')).toHaveText('1')
    await sec.focus()
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown')
    await expect(sec.locator('[aria-selected="true"]')).toHaveText('3')
    await page.fill('.inline-input', 'Tea')
    await page.locator('.inline-input').blur()
    await page.click('.btn-circle:has-text("Start")')
    await expect(page.locator('.countdown-label')).toHaveText('Tea')
    await expect(page.locator('.countdown-time')).toHaveText(/00:0[1-3]/)
    await page.click('.btn-circle:has-text("Pause")')
    await expect(page.locator('.btn-circle:has-text("Resume")')).toBeVisible()
    await expect(page.locator('.countdown-end')).toHaveClass(/is-paused/)
    await page.click('.btn-circle:has-text("Resume")')
    // it rings even on another page
    await page.keyboard.press(`${mod}+1`)
    await expect(page.locator('.timer-alert')).toBeVisible({ timeout: 6000 })
    await expect(page.locator('.timer-alert-text')).toHaveText('00:03 is up')
    expect(await audioKeys(audio)).toEqual(['timer'])
    const n = /** @type {any[]} */ (await hook(app, 'notifications')).at(-1)
    expect(n).toMatchObject({ title: '⏱ Tea', body: '00:03 timer is done.' })
    await page.click('.timer-alert .btn-filled:has-text("Repeat")')
    await expect(page.locator('.timer-alert')).toHaveCount(0)
    await page.keyboard.press(`${mod}+3`)
    await expect(page.locator('.countdown')).toBeVisible()
    await page.click('.btn-circle:has-text("Cancel")')
    await expect(page.locator('wheel-picker')).toHaveCount(3)
    // recents: newest first, ▶ starts it, Remove
    await expect(page.locator('.recent-duration')).toHaveText(['00:03'])
    await expect(page.locator('.recent-label')).toHaveText(['Tea'])
    await page.click('[aria-label="Start 3 sec timer"]')
    await expect(page.locator('.countdown')).toBeVisible()
    await page.click('.btn-circle:has-text("Cancel")')
    await page.hover('.recent-row')
    await page.click('.recent-remove')
    await expect(page.locator('.recent-row')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('timer finishing more than 10 min late only notifies', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await page.keyboard.press(`${mod}+3`)
    await page.click('.btn-circle:has-text("Start")') // 5 min
    await hook(app, 'setClock', T + 5 * 60_000 + 11 * 60_000)
    await waitFor(async () => /** @type {any[]} */ (await hook(app, 'notifications')).some((n) => n.title === 'Timer ended'))
    const n = /** @type {any[]} */ (await hook(app, 'notifications')).find((x) => x.title === 'Timer ended')
    expect(n.body).toBe('Your 05:00 timer finished while the computer was asleep.')
    await expect(page.locator('.timer-alert')).toHaveCount(0)
    await expect(page.locator('wheel-picker')).toHaveCount(3)
  } finally {
    await app.close()
  }
})

test('stopwatch: Start/Lap/Stop/Reset, Space and L, best/worst laps, survives restart', async () => {
  const { app, dataDir } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await page.keyboard.press(`${mod}+2`)
    await expect(page.locator('.stopwatch-time')).toHaveText('00:00.00')
    await expect(page.locator('.btn-circle:has-text("Reset")')).toBeDisabled()
    await page.keyboard.press('Space')
    await expect(page.locator('.btn-circle:has-text("Stop")')).toBeVisible()
    await page.waitForTimeout(300)
    await page.keyboard.press('l')
    await page.waitForTimeout(150)
    await page.keyboard.press('l')
    await page.waitForTimeout(450)
    await page.keyboard.press('l')
    await expect(page.locator('.lap')).toHaveCount(4)
    await expect(page.locator('.lap').first()).toContainText('Lap 4')
    await expect(page.locator('.lap-best')).toContainText('Lap 2')
    await expect(page.locator('.lap-worst')).toContainText('Lap 3')
    // display advances every frame
    const a = await page.locator('.stopwatch-time').innerText()
    await page.waitForTimeout(100)
    expect(await page.locator('.stopwatch-time').innerText()).not.toBe(a)
    await app.close()
    const again = await launch({ dataDir, clock: T + 60_000 })
    const p2 = await mainWindow(again.app)
    await p2.keyboard.press(`${mod}+2`)
    await expect(p2.locator('.stopwatch-time')).toHaveText(/^01:0\d\.\d\d$/)
    await expect(p2.locator('.btn-circle:has-text("Stop")')).toBeVisible() // still running after restart
    await expect(p2.locator('.lap')).toHaveCount(4)
    await p2.click('.btn-circle:has-text("Stop")')
    await expect(p2.locator('.btn-circle:has-text("Start")')).toBeVisible()
    await p2.keyboard.press('l')
    await expect(p2.locator('.stopwatch-time')).toHaveText('00:00.00')
    await again.app.close()
  } finally {
    await app.close().catch(() => {})
  }
})

test('settings: every change applies and persists at once; theme, time format, defaults', async () => {
  const { app, dataDir } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await page.keyboard.press(`${mod}+4`)
    await page.click('.segmented-option:has-text("Light")')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.click('.segmented-option:has-text("12-hour")')
    await expect(page.locator('.topbar-clock')).toHaveText('11:51AM')
    await page.selectOption('select[aria-label="Gradual Volume"]', { label: '5 min' })
    await page.selectOption('select[aria-label="Ring Late Alarms For"]', { label: '2 hr' })
    await page.click('.row:has-text("Snooze Length") [aria-label="Increase"]')
    await expect(page.locator('.row:has-text("Snooze Length") .row-label')).toHaveText('Snooze Length · 10 min')
    await page.click('.segmented-option:has-text("Code")')
    await page.click('.segmented-option:has-text("Easy")')
    await page.click('[aria-label="Keep computer awake while alarms are on"]')
    await page.click('[aria-label="Open at Login"]')
    await expect(page.locator('.row:has-text("Version") .row-detail')).toHaveText('1.0.0')
    await expect(page.locator('.page-settings')).not.toContainText('Alarm Sound')
    await expect(page.locator('.section:has-text("RELIABILITY") .section-footer')).toHaveText(
      'Alarm keeps running in the menu bar / tray and rings even when its window is closed.',
    )
    await expect(page.locator('.section:has-text("RELIABILITY") .row .row-label')).toHaveText([
      'Notifications',
      'Open at Login',
      'Keep Computer Awake',
    ])
    await page.click('.row-button:has-text("Sound")')
    await expect(page.locator('.sheet-title')).toHaveText('Default Sound')
    await page.click('.row-button:has-text("Harp")')
    await page.click('.sheet .btn-link:has-text("Done")')
    await expect(page.locator('.row-button:has-text("Sound") .row-detail')).toHaveText('Harp')
    await app.close()
    const lines = fs.readFileSync(path.join(dataDir, 'journal.jsonl'), 'utf8').trim().split('\n')
    const last = JSON.parse(lines.filter((l) => l.includes('SettingsChanged')).at(-1) ?? '{}').settings
    expect(last).toMatchObject({
      theme: 'light',
      hourCycle: '12h',
      rampSeconds: 300,
      missedGraceMinutes: 120,
      snoozeMinutes: 10,
      defaultTask: { type: 'retype', difficulty: 'easy', count: 2 },
      keepAwake: true,
      openAtLogin: false,
      defaultSound: { kind: 'builtin', id: 'harp' },
    })
    const again = await launch({ dataDir, clock: T })
    const p2 = await mainWindow(again.app)
    await expect(p2.locator('html')).toHaveAttribute('data-theme', 'light')
    await p2.click('text=Add Alarm')
    await expect(p2.locator('.row-button:has-text("Sound") .row-detail')).toHaveText('Harp')
    await expect(p2.locator('.row-button:has-text("Gradual Volume") .row-detail')).toHaveText('5 min')
    await expect(p2.locator('.row-button:has-text("Turn Off With") .row-detail')).toHaveText('Retype Code · Easy · 2×')
    await again.app.close()
  } finally {
    await app.close().catch(() => {})
  }
})

test('notification banners: not asked → Allow Notifications / Turn On; denied → platform text', async () => {
  const a = await launch({ clock: T, journal: [settingsEvent({})], notifications: 'default' })
  try {
    const page = await mainWindow(a.app)
    await expect(page.locator('.banner-title')).toHaveText('Allow Notifications')
    await expect(page.locator('.banner .btn-filled')).toHaveText('Turn On')
    await page.keyboard.press(`${mod}+4`)
    await expect(page.locator('.row:has-text("Notifications") .btn-filled')).toHaveText('Turn On')
  } finally {
    await a.app.close()
  }
  const b = await launch({ clock: T, journal: [settingsEvent({})], notifications: 'denied' })
  try {
    const page = await mainWindow(b.app)
    await expect(page.locator('.banner-title')).toHaveText('Notifications are blocked')
    const expected =
      process.platform === 'darwin'
        ? 'Allow notifications in System Settings → Notifications.'
        : process.platform === 'win32'
          ? 'Allow notifications in Settings → System → Notifications.'
          : 'Allow notifications in your desktop settings.'
    await expect(page.locator('.banner-text')).toContainText(expected)
    await page.keyboard.press(`${mod}+4`)
    await expect(page.locator('.row:has-text("Notifications") .row-detail')).toHaveText('Blocked')
  } finally {
    await b.app.close()
  }
})

test('sounds: six built-ins with their loop lengths; picking plays once; preview wake-up loops with the ramp', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    const audio = await audioWindow(app)
    const lengths = { sunrise: 4.8, harp: 3.2, chimes: 3.6, beacon: 2, pulse: 1.6, classic: 2 }
    for (const [id, len] of Object.entries(lengths)) {
      const d = await audio.evaluate((x) => /** @type {any} */ (window).__audio.describe(x), id)
      expect(d.duration).toBeCloseTo(len, 2)
      expect(d.peak).toBeGreaterThan(0.05)
    }
    // beacon: 4 beeps 0.16 s apart; pulse: 3 peaks 0.2 s apart; chimes: 6 strikes at the given times
    const beacon = await audio.evaluate(() => /** @type {any} */ (window).__audio.describe('beacon'))
    expect(beacon.onsets.slice(0, 4)).toEqual([0, 0.16, 0.32, 0.48])
    const pulse = await audio.evaluate(() => /** @type {any} */ (window).__audio.describe('pulse'))
    expect(pulse.onsets.slice(0, 3)).toEqual([0, 0.2, 0.4])
    const chimes = await audio.evaluate(() => /** @type {any} */ (window).__audio.describe('chimes'))
    expect(chimes.onsets.slice(0, 6)).toEqual([0, 0.45, 0.9, 1.35, 1.95, 2.4])

    await page.click('text=Add Alarm')
    await page.click('.row-button:has-text("Sound")')
    await page.click('.row-button:has-text("Pulse")')
    await waitFor(async () => (await audioKeys(audio)).includes('preview'))
    const spec = await audio.evaluate(() => /** @type {any} */ (window).__audio.spec('preview'))
    expect(spec).toMatchObject({ sound: { id: 'pulse' }, loop: false, rampSeconds: 0, volume: 0.9 })
    await page.click('.btn-back')
    await waitFor(async () => !(await audioKeys(audio)).includes('preview'))
    await expect(page.locator('.row-button:has-text("Sound") .row-detail')).toHaveText('Pulse')
    await page.click('text=Preview Wake-up')
    await expect(page.locator('.row-button:has-text("Stop Preview")')).toBeVisible()
    await waitFor(async () => (await audio.evaluate(() => /** @type {any} */ (window).__audio.elapsed('preview'))) !== null)
    const s2 = await audio.evaluate(() => /** @type {any} */ (window).__audio.spec('preview'))
    expect(s2).toMatchObject({ loop: true, rampSeconds: 60, volume: 0.9 })
    // ramp: gain(t) = v × (0.015 + 0.985 x²)
    await page.waitForTimeout(1500)
    const [g, t] = await audio.evaluate(() => [
      /** @type {any} */ (window).__audio.gain('preview'),
      /** @type {any} */ (window).__audio.elapsed('preview'),
    ])
    const expected = 0.9 * (0.015 + 0.985 * (t / 60) ** 2)
    expect(Math.abs(g - expected)).toBeLessThan(0.01)
    await page.click('text=Stop Preview')
    await waitFor(async () => !(await audioKeys(audio)).includes('preview'))
  } finally {
    await app.close()
  }
})

test('music file: validated, copied, selectable, deletable; a missing file shows "Missing file" and rings Sunrise', async () => {
  const dir = tempDir('alarm-music-')
  // a valid 0.2 s WAV
  const rate = 8000
  const n = 1600
  const wav = Buffer.alloc(44 + n * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + n * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin(i / 3) * 8000), 44 + i * 2)
  fs.writeFileSync(path.join(dir, 'Morning Song.wav'), wav)
  fs.writeFileSync(path.join(dir, 'fake.mp3'), 'not audio at all')
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'hello')

  const { app, dataDir } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await page.keyboard.press(`${mod}+4`)
    /** @param {string} file */
    const pick = (file) =>
      app.evaluate(
        ({ dialog }, f) => {
          /** @type {any} */ dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f] })
        },
        path.join(dir, file),
      )
    await pick('notes.txt')
    await page.click('text=Add Music File…')
    await expect(page.locator('.section:has-text("YOUR MUSIC") .section-footer')).toHaveText('That file is not an audio file.')
    await pick('fake.mp3')
    await page.click('text=Add Music File…')
    await expect(page.locator('.section:has-text("YOUR MUSIC") .section-footer')).toHaveText(
      'This audio format cannot be played on this computer.',
    )
    await pick('Morning Song.wav')
    await page.click('text=Add Music File…')
    await expect(page.locator('.row:has-text("Morning Song") .row-detail')).toHaveText('0.0 MB')
    const stored = fs.readdirSync(path.join(dataDir, 'sounds'))
    expect(stored).toHaveLength(1)
    // pick it in the editor; the original can move away, the copy stays
    fs.rmSync(path.join(dir, 'Morning Song.wav'))
    await page.keyboard.press(`${mod}+1`)
    await page.click('text=Add Alarm')
    await page.click('.row-button:has-text("Sound")')
    await page.click('.row-button:has-text("Morning Song")')
    await page.click('.btn-back')
    await expect(page.locator('.row-button:has-text("Sound") .row-detail')).toHaveText('Morning Song')
    await page.click('text=Save')
    // delete the file → Missing file in the editor; ringing falls back to Sunrise
    await page.keyboard.press(`${mod}+4`)
    await page.click('[aria-label="Delete Morning Song"]')
    await waitFor(() => fs.readdirSync(path.join(dataDir, 'sounds')).length === 0)
    await page.keyboard.press(`${mod}+1`)
    await page.click('.alarm-row')
    await expect(page.locator('.row-button:has-text("Sound") .row-detail')).toHaveText('Missing file')
    await page.keyboard.press('Escape')
    const audio = await audioWindow(app)
    // created at 11:51 → the next 11:51 is tomorrow
    await hook(app, 'setClock', at(2026, 11, 11, 11, 51, 1))
    await waitFor(async () => (await audioKeys(audio)).length === 1)
    const spec = await audio.evaluate(() =>
      /** @type {any} */ (window).__audio.spec(/** @type {any} */ (window).__audio.keys()[0]),
    )
    expect(spec.sound).toEqual({ kind: 'builtin', id: 'sunrise' })
  } finally {
    await app.close()
  }
})

test('wheel picker: mouse drag glides to a row, wheel scroll settles, click selects', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})] })
  try {
    const page = await mainWindow(app)
    await page.click('text=Add Alarm')
    const hour = page.locator('wheel-picker[aria-label="Hour"]')
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await hour.boundingBox())
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    // slow drag up by two rows (no flick): 11 → 13
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 1; i <= 24; i++) {
      await page.mouse.move(cx, cy - i * 3)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(150) // pause before release → no flick
    await page.mouse.up()
    await expect(hour.locator('[aria-selected="true"]')).toHaveText('13')
    // the pointer keeps the grip outside the wheel
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(cx + i * 40, cy + i * 3.6)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(150)
    await page.mouse.up()
    await expect(hour.locator('[aria-selected="true"]')).toHaveText('12')
    // mouse wheel: settles 90 ms after the last event on the nearest row
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, 36 * 3)
    await expect(hour.locator('[aria-selected="true"]')).toHaveText('15')
    // click a row
    await hour.locator('.wheel-option', { hasText: /^16$/ }).click()
    await expect(hour.locator('[aria-selected="true"]')).toHaveText('16')
    await page.click('text=Save')
    await expect(page.locator('.alarm-clock')).toHaveText('16:51')
  } finally {
    await app.close()
  }
})

test('widget gallery (stage 6): every §4.4 widget renders and reacts', async () => {
  const { app } = await launch({ clock: T, journal: [settingsEvent({})], env: { ALARM_GALLERY: '1' } })
  try {
    const page = await mainWindow(app)
    await expect(page.locator('.segmented')).toHaveCount(1)
    await expect(page.locator('.switch')).toHaveCount(1)
    await expect(page.locator('.stepper')).toHaveCount(1)
    await expect(page.locator('.slider')).toHaveCount(1)
    await expect(page.locator('.btn-circle')).toHaveCount(5)
    await expect(page.locator('wheel-picker')).toHaveCount(1)
    await expect(page.locator('.banner')).toHaveCount(1)
    await expect(page.locator('.gallery-icon')).toHaveCount(14)
    await page.click('.segmented-option:has-text("Retype Code")')
    await expect(page.locator('.segmented-option.is-selected')).toHaveText('Retype Code')
    await page.click('.switch')
    await expect(page.locator('.switch')).toHaveAttribute('aria-checked', 'false')
    await page.click('[aria-label="Increase"]')
    await expect(page.locator('.row:has(.stepper) .row-label')).toHaveText('3 tasks in a row')
    await page.click('.btn-plus')
    await expect(page.locator('.sheet')).toBeVisible()
    await page.click('.sheet-backdrop', { position: { x: 5, y: 5 } })
    await expect(page.locator('.sheet')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
