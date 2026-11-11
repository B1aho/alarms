/**
 * `main` = shell. Lives for the whole app run: single-instance lock, tray, notifications,
 * keep-awake, login item, protocols and the bus broker. It never touches the domain:
 * it only executes what the engine asks for and reports OS signals back.
 *
 * Environment (tests and development):
 *   ALARM_USER_DATA=<dir>        use this data folder instead of userData
 *   ALARM_TEST=1                 test hooks (globalThis.__alarm) and the engine test clock
 *   ALARM_TEST_CLOCK=<epoch ms>  start the engine clock at this time (test mode only)
 *   ALARM_TEST_NOTIFICATIONS=default|granted|denied  pretend OS notification permission (test mode only)
 *   ALARM_TEST_DSF=2             device scale factor for screenshots (test mode only)
 *   ALARM_START_HIDDEN=1         start in the tray without a window
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, dialog, ipcMain, Menu, nativeTheme, powerMonitor } from 'electron'
import { IPC, MEDIA_EXTENSIONS } from '../contract/channels.js'
import { createBroker } from './broker.js'
import { handleProtocols, registerSchemes } from './media-protocol.js'
import { ACTION_PROTOCOL, createNotifications, readPermission, requestPermission } from './notifications.js'
import { createLoginItem } from './login-item.js'
import { createPower } from './power.js'
import { createTray } from './tray.js'
import { createWakeTimer } from './wake-timer.js'
import { createWindows, QUIET } from './windows.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..')
const rootDir = path.resolve(srcDir, '..')
const testMode = process.env.ALARM_TEST === '1'
const log = (/** @type {string} */ msg) => console.log(msg)

if (process.env.ALARM_USER_DATA) app.setPath('userData', process.env.ALARM_USER_DATA)
app.setAppUserModelId('com.example.alarm')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (QUIET) {
  // The transparent test window counts as occluded: keep its timers and animation frames running.
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}
if (testMode && process.env.ALARM_TEST_DSF) app.commandLine.appendSwitch('force-device-scale-factor', process.env.ALARM_TEST_DSF)
registerSchemes()

if (!app.requestSingleInstanceLock()) {
  // Second launch: the first instance shows its window (TZ §7).
  app.quit()
} else {
  void app.whenReady().then(start)
}

function start() {
  const dataDir = app.getPath('userData')
  handleProtocols({ srcDir, soundsDir: path.join(dataDir, 'sounds') })
  if (process.platform === 'win32') app.setAsDefaultProtocolClient(ACTION_PROTOCOL)
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null,
  )

  const loginItem = createLoginItem(log)
  const power = createPower()
  const wakeTimer = createWakeTimer(log)
  let quitting = false
  let notifyTitle = app.getName()

  const engineArgs = [`--data=${dataDir}`]
  if (testMode) {
    engineArgs.push('--test')
    if (process.env.ALARM_TEST_CLOCK) engineArgs.push(`--test-clock=${process.env.ALARM_TEST_CLOCK}`)
  }

  const broker = createBroker({
    enginePath: path.join(srcDir, 'engine', 'main.js'),
    engineArgs,
    log,
    onMessage: handleEngineMessage,
    onEngineStart: () => {
      sendSystemInfo()
      void sendPermission()
    },
  })

  const windows = createWindows({
    preloadDir: path.join(srcDir, 'preload'),
    onRenderer: (role, wc) => broker.attach(role, wc),
    onFocus: () => {
      broker.send({ type: 'WindowFocused' })
      void sendPermission()
    },
    log,
  })

  const notifications = createNotifications({
    onClick: () => windows.showMain(),
    onSnooze: (id) => broker.send({ type: 'Snooze', id }),
    log,
  })

  const tray = createTray({
    assetsDir: path.join(rootDir, 'assets'),
    onOpen: () => windows.showMain(),
    onSnooze: (id) => broker.send({ type: 'Snooze', id }),
    onQuit: () => app.quit(),
  })

  /** @param {any} msg validated by the broker */
  function handleEngineMessage(msg) {
    switch (msg.type) {
      case 'StateProjected': {
        const s = msg.state
        nativeTheme.themeSource = s.settings.theme
        loginItem.apply(s.settings.openAtLogin)
        wakeTimer.schedule(s.nextRingAt)
        break
      }
      case 'NotificationRequested':
        notifications.show(msg)
        break
      case 'NotificationClosed':
        notifications.close(msg.tag)
        break
      case 'KeepAwakeChanged':
        power.set(msg.on)
        break
      case 'RingingChanged':
        notifyTitle = msg.tray.tooltip
        tray.update(msg.tray, msg.snoozeAlarmId)
        windows.setDefaultTitle(msg.tray.tooltip)
        windows.setRinging(msg.ringing.length > 0, msg.title)
        break
      case 'TimerAlertChanged':
        windows.setTimerAlert(msg.ringing)
        break
    }
  }

  function sendSystemInfo() {
    const locale = app.getSystemLocale() || 'en-US'
    let hc
    try {
      hc = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle
    } catch {
      hc = 'h23'
    }
    broker.send({
      type: 'SystemInfo',
      hourCycle: hc === 'h11' || hc === 'h12' ? '12h' : '24h',
      locale: locale.slice(0, 64),
      platform: process.platform,
      version: app.getVersion(),
    })
  }

  async function sendPermission() {
    const forced = testMode ? process.env.ALARM_TEST_NOTIFICATIONS : undefined
    const state = forced === 'default' || forced === 'granted' || forced === 'denied' ? forced : await readPermission()
    broker.send({ type: 'NotificationPermission', state })
    return state
  }

  ipcMain.handle(IPC.pickSoundFile, async (e) => {
    const win = windows.main()
    if (!win || e.sender !== win.webContents) return null
    const res = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: '', extensions: [...MEDIA_EXTENSIONS, ...MEDIA_EXTENSIONS.map((x) => x.toUpperCase())] }],
    })
    if (res.canceled || !res.filePaths[0]) return null
    return { path: res.filePaths[0], name: path.basename(res.filePaths[0]) }
  })

  ipcMain.handle(IPC.requestNotifications, async (e) => {
    if (e.sender !== windows.main()?.webContents) return
    requestPermission(notifyTitle)
    // The user answers the system prompt at their own pace: poll for a minute.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      if ((await sendPermission()) !== 'default') return
    }
  })

  app.on('second-instance', (_e, argv) => {
    notifications.handleArgv(argv)
    if (!argv.some((a) => a.startsWith(`${ACTION_PROTOCOL}://`))) windows.showMain()
  })
  app.on('activate', () => windows.showMain())
  app.on('window-all-closed', () => {
    // Closing the window never quits: the app keeps running in the tray.
  })
  app.on('before-quit', () => {
    quitting = true
    broker.stop()
    power.set(false)
  })
  powerMonitor.on('resume', () => broker.send({ type: 'WindowFocused' }))
  powerMonitor.on('unlock-screen', () => {
    broker.send({ type: 'WindowFocused' })
    windows.reassert()
  })

  broker.start()
  windows.createAudio()
  if (QUIET) app.dock?.hide()
  if (process.platform === 'darwin' && loginItem.launchedHidden()) app.dock?.hide()
  if (!loginItem.launchedHidden() && process.env.ALARM_START_HIDDEN !== '1') windows.showMain()
  else if (process.platform === 'darwin') app.dock?.hide()
  notifications.handleArgv(process.argv)

  if (testMode) {
    /** Test hooks, reachable from Playwright's `electronApp.evaluate`. */
    Object.assign(globalThis, {
      __alarm: {
        enginePid: () => broker.pid(),
        engineRestarts: () => broker.restarts(),
        killEngine: () => broker.kill(),
        crashAudio: () => windows.audio()?.webContents.forcefullyCrashRenderer(),
        audioRestarts: () => windows.audioRestarts(),
        /** @param {number} now */
        setClock: (now) => broker.send({ type: 'TestSetClock', now }),
        trayLabels: () => tray.labels(),
        /** @param {string} id */
        trayClick: (id) => tray.click(id),
        notifications: () => notifications.history(),
        activeNotifications: () => notifications.activeTags(),
        keepAwake: () => power.isOn(),
        mainWindow: () => {
          const w = windows.main()
          return w && !w.isDestroyed()
            ? { visible: w.isVisible(), alwaysOnTop: w.isAlwaysOnTop(), title: w.getTitle(), bounds: w.getBounds() }
            : null
        },
        closeMain: () => windows.main()?.close(),
        showMain: () => void windows.showMain(),
        isQuitting: () => quitting,
      },
    })
  }
}
