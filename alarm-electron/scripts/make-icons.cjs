/**
 * Renders assets/*.svg into the PNG icons (run with Electron: `npx electron scripts/make-icons.cjs`).
 *   icon.png (1024)              app icon (electron-builder makes .icns/.ico from it)
 *   trayTemplate.png / @2x       macOS menu bar template (black on transparent)
 *   tray.png / @2x               Windows/Linux tray (orange)
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const assets = path.join(__dirname, '..', 'assets')

/** @type {BrowserWindow | null} */
let win = null

/** @param {string} svg @param {number} size @param {string} out */
async function render(svg, size, out) {
  win ??= new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
  const file = path.join(app.getPath('temp'), 'alarm-icon.html')
  fs.writeFileSync(file, html)
  await win.loadFile(file)
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  fs.writeFileSync(path.join(assets, out), img.resize({ width: size, height: size }).toPNG())
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const icon = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8')
  const tray = fs.readFileSync(path.join(assets, 'tray.svg'), 'utf8')
  await render(icon, 1024, 'icon.png')
  await render(tray, 16, 'trayTemplate.png')
  await render(tray, 32, 'trayTemplate@2x.png')
  const orange = tray.replace('stroke="#000"', 'stroke="#FF9F0A"')
  await render(orange, 16, 'tray.png')
  await render(orange, 32, 'tray@2x.png')
  app.quit()
})
