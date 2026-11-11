/* global window */
/**
 * The packaged app (asar, `npm run dist:mac` or `electron-builder --dir`): protocols read from
 * the archive, the engine forks from it, and an alarm rings with the window closed.
 * Skipped when no build is present.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { alarmEvents, audioWindow, hook, ROOT, settingsEvent, tempDir, waitFor } from './helpers.js'

const candidates = {
  darwin: ['dist/mac-arm64/Alarm.app/Contents/MacOS/Alarm', 'dist/mac/Alarm.app/Contents/MacOS/Alarm'],
  win32: ['dist/win-unpacked/Alarm.exe'],
  linux: ['dist/linux-unpacked/alarm', 'dist/linux-arm64-unpacked/alarm'],
}
const exe = (candidates[/** @type {'darwin' | 'win32' | 'linux'} */ (process.platform)] ?? [])
  .map((p) => path.join(ROOT, p))
  .find((p) => fs.existsSync(p))

test('packaged build: UI loads from the archive and the alarm rings with the window closed', async () => {
  test.skip(!exe, 'no packaged build in dist/')
  const dataDir = tempDir()
  const trigger = Date.now() + 6000
  const d = new Date(trigger)
  fs.writeFileSync(
    path.join(dataDir, 'journal.jsonl'),
    [
      settingsEvent({}),
      ...alarmEvents([
        {
          hour: d.getHours(),
          minute: d.getMinutes(),
          label: 'Packaged',
          nextTriggerAt: trigger,
          task: { type: 'none', difficulty: 'easy', count: 1 },
        },
      ]),
    ].join('\n') + '\n',
  )
  const app = await electron.launch({ executablePath: exe, env: { ...process.env, ALARM_TEST: '1', ALARM_USER_DATA: dataDir } })
  try {
    await waitFor(() => app.windows().some((p) => p.url().includes('/ui/index.html')))
    const ui = /** @type {import('@playwright/test').Page} */ (app.windows().find((p) => p.url().includes('/ui/index.html')))
    await expect(ui.locator('.page-title')).toHaveText('Alarms')
    await expect(ui.locator('.alarm-subtitle')).toHaveText('Packaged')
    const audio = await audioWindow(app)
    await hook(app, 'closeMain')
    await waitFor(async () => (await audio.evaluate(() => /** @type {any} */ (window).__audio.keys())).length > 0, 12_000, 50)
    expect(Date.now() - trigger).toBeLessThan(1000)
    await waitFor(async () => /** @type {any} */ (await hook(app, 'mainWindow'))?.alwaysOnTop === true)
  } finally {
    await app.close()
  }
})
