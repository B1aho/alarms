/**
 * Open at Login (TZ §3.4). macOS and Windows: `app.setLoginItemSettings` (hidden start);
 * Linux: `~/.config/autostart/alarm.desktop`. In development (`electron .`) nothing is registered
 * unless ALARM_FORCE_LOGIN_ITEM=1 — otherwise the bare Electron binary would start at login.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

export const HIDDEN_ARG = '--hidden'

/** @param {(msg: string) => void} log */
export function createLoginItem(log) {
  /** @type {boolean | null} */
  let applied = null
  const enabled = () => app.isPackaged || process.env.ALARM_FORCE_LOGIN_ITEM === '1'

  function linuxDesktopFile() {
    return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'autostart', 'alarm.desktop')
  }

  return {
    /** @param {boolean} openAtLogin */
    apply(openAtLogin) {
      if (applied === openAtLogin) return
      applied = openAtLogin
      if (!enabled()) {
        log(`[shell] Open at Login = ${openAtLogin} (not registered in development)`)
        return
      }
      if (process.platform === 'linux') {
        const file = linuxDesktopFile()
        if (openAtLogin) {
          const exec = process.env.APPIMAGE ?? process.execPath
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(
            file,
            `[Desktop Entry]\nType=Application\nName=${app.getName()}\nExec="${exec}" ${HIDDEN_ARG}\nX-GNOME-Autostart-enabled=true\nTerminal=false\n`,
          )
        } else fs.rmSync(file, { force: true })
        return
      }
      app.setLoginItemSettings(/** @type {any} */ ({ openAtLogin, openAsHidden: true, args: [HIDDEN_ARG] }))
    },
    /** True when this launch came from the login item: start hidden in the tray. */
    launchedHidden() {
      if (process.argv.includes(HIDDEN_ARG)) return true
      if (process.platform === 'darwin') {
        const s = /** @type {any} */ (app.getLoginItemSettings())
        return Boolean(s.wasOpenedAtLogin || s.wasOpenedAsHidden)
      }
      return false
    },
  }
}
