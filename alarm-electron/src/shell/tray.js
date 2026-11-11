/**
 * Tray / menu bar icon (TZ §3.13). Menu: Open Alarm; "Snooze N min" only while an alarm with
 * snooze rings; separator; Quit. Texts come from the engine (domain/strings.js).
 */

import path from 'node:path'
import { Menu, nativeImage, Tray } from 'electron'

/**
 * @param {object} o
 * @param {string} o.assetsDir
 * @param {() => void} o.onOpen
 * @param {(alarmId: string) => void} o.onSnooze
 * @param {() => void} o.onQuit
 */
export function createTray(o) {
  const isMac = process.platform === 'darwin'
  const icon = nativeImage.createFromPath(path.join(o.assetsDir, isMac ? 'trayTemplate.png' : 'tray.png'))
  if (isMac) icon.setTemplateImage(true)
  const tray = new Tray(icon)
  /** @type {Electron.MenuItemConstructorOptions[]} */
  let template = []

  return {
    /**
     * @param {{ tooltip: string, open: string, quit: string, snooze: string | null }} texts
     * @param {string | null} snoozeAlarmId
     */
    update(texts, snoozeAlarmId) {
      tray.setToolTip(texts.tooltip)
      template = [
        { id: 'open', label: texts.open, click: () => o.onOpen() },
        ...(texts.snooze && snoozeAlarmId ? [{ id: 'snooze', label: texts.snooze, click: () => o.onSnooze(snoozeAlarmId) }] : []),
        { type: 'separator' },
        { id: 'quit', label: texts.quit, click: () => o.onQuit() },
      ]
      tray.setContextMenu(Menu.buildFromTemplate(template))
    },
    /** Labels of the current menu (tests). */
    labels: () => template.map((t) => (t.type === 'separator' ? '—' : String(t.label))),
    /** @param {string} id */
    click(id) {
      const item = template.find((t) => t.id === id)
      item?.click?.(/** @type {any} */ (null), /** @type {any} */ (null), /** @type {any} */ (null))
    },
    destroy: () => tray.destroy(),
  }
}
