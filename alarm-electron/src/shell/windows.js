/**
 * Windows: the main window (`ui` renderer, created on demand and destroyed on close)
 * and the hidden `audio` renderer (lives all the time, re-created if it crashes).
 */

import path from 'node:path'
import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import { appUrl } from './media-protocol.js'

/** @typedef {import('../contract/channels.js').Role} Role */

export const WINDOW = Object.freeze({ width: 1100, height: 820, minWidth: 400, minHeight: 560 })

/**
 * Automated tests run "quietly" so they never get in the way of the person at the computer:
 * windows are transparent and click-through, never take focus, audio is muted.
 * ALARM_TEST_VISIBLE=1 shows everything for debugging.
 */
export const QUIET = process.env.ALARM_TEST === '1' && process.env.ALARM_TEST_VISIBLE !== '1'

/**
 * @param {object} o
 * @param {string} o.preloadDir
 * @param {(role: Role, wc: Electron.WebContents) => void} o.onRenderer
 * @param {() => void} o.onFocus
 * @param {(msg: string) => void} o.log
 */
export function createWindows(o) {
  /** @type {BrowserWindow | null} */
  let main = null
  /** @type {BrowserWindow | null} */
  let audio = null
  let ringing = false
  let audioRestarts = 0
  let timerAlert = false
  /** @type {Electron.Rectangle | null} */
  let savedBounds = null
  let defaultTitle = app.getName()
  /** @type {string | null} */
  let ringTitle = null

  const isMac = process.platform === 'darwin'

  /** @param {string} preload */
  const webPreferences = (preload) => ({
    preload: path.join(o.preloadDir, preload),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: false,
    autoplayPolicy: /** @type {const} */ ('no-user-gesture-required'),
  })

  function createMain() {
    const win = new BrowserWindow({
      ...WINDOW,
      useContentSize: true,
      center: true,
      show: false,
      title: defaultTitle,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#F2F2F7',
      webPreferences: webPreferences('ui.js'),
    })
    main = win
    if (QUIET) {
      win.setOpacity(0)
      win.setIgnoreMouseEvents(true)
      win.setFocusable(false)
    }
    o.onRenderer('ui', win.webContents)
    win.on('page-title-updated', (e) => e.preventDefault())
    win.on('focus', () => o.onFocus())
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      if (QUIET) win.showInactive()
      else win.show()
    })
    win.on('closed', () => {
      if (main === win) main = null
      savedBounds = null
      if (isMac) app.dock?.hide()
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    void win.loadURL(appUrl(process.env.ALARM_GALLERY === '1' ? 'ui/gallery.html' : 'ui/index.html'))
    applyTitle()
    return win
  }

  function showMain() {
    if (isMac && !QUIET) void app.dock?.show()
    const win = main ?? createMain()
    if (QUIET) {
      if (!win.webContents.isLoading()) win.showInactive()
      return win
    }
    if (win.isMinimized()) win.restore()
    if (win.webContents.isLoading()) win.once('ready-to-show', () => win.focus())
    else {
      win.show()
      win.focus()
    }
    return win
  }

  function applyTitle() {
    main?.setTitle(ringTitle ?? defaultTitle)
  }

  /** Full-screen, above everything, on every workspace (TZ §6 3.5, §7). */
  function raiseForAlarm() {
    const win = showMain()
    if (!savedBounds) savedBounds = win.getBounds()
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    // Visual tests capture the ringing screen in the standard 1100 × 820 window.
    if (process.env.ALARM_TEST !== '1' || process.env.ALARM_TEST_KEEP_BOUNDS !== '1') {
      win.setBounds(screen.getDisplayMatching(win.getBounds()).bounds)
    }
    if (QUIET) return
    win.moveTop()
    win.focus()
    app.focus({ steal: true })
  }

  function lowerAfterAlarm() {
    if (!main) return
    main.setAlwaysOnTop(false)
    main.setVisibleOnAllWorkspaces(false)
    if (savedBounds) main.setBounds(savedBounds)
    savedBounds = null
  }

  function createAudio() {
    const win = new BrowserWindow({
      show: false,
      width: 200,
      height: 100,
      skipTaskbar: true,
      focusable: false,
      webPreferences: { ...webPreferences('audio.js'), backgroundThrottling: false },
    })
    audio = win
    if (QUIET) win.webContents.setAudioMuted(true)
    o.onRenderer('audio', win.webContents)
    win.webContents.on('render-process-gone', (_e, details) => {
      o.log(`[shell] audio renderer gone (${details.reason}); re-creating`)
      if (audio === win) audio = null
      audioRestarts++
      if (!win.isDestroyed()) win.destroy()
      setTimeout(createAudio, 100)
    })
    void win.loadURL(appUrl('audio/index.html'))
    return win
  }

  return {
    showMain,
    createAudio,
    main: () => main,
    audio: () => audio,
    /** @param {string} title */
    setDefaultTitle(title) {
      defaultTitle = title
      applyTitle()
    },
    /**
     * @param {boolean} on
     * @param {string | null} title
     */
    setRinging(on, title) {
      ringTitle = title
      if (on && !ringing) raiseForAlarm()
      if (!on && ringing) lowerAfterAlarm()
      ringing = on
      applyTitle()
    },
    /** @param {boolean} on */
    setTimerAlert(on) {
      if (on && !timerAlert) {
        const win = showMain()
        if (!QUIET) {
          win.moveTop()
          app.focus({ steal: true })
        }
      }
      timerAlert = on
    },
    /** After unlocking the screen the ringing window must be on top at once. */
    reassert() {
      if (ringing) raiseForAlarm()
    },
    isRinging: () => ringing,
    audioRestarts: () => audioRestarts,
  }
}
