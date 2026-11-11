/**
 * Copies the reference screenshots (../docs/screens, read-only) into test/visual/baseline.
 * The full-page Settings references (30, 36) are cropped to the first 1100 × 820 window
 * frame: their RELIABILITY section differs by design (TZ_ELECTRON.md §3.3–3.6), which
 * changes the page height. Run with Electron: `npx electron scripts/prepare-visual-baselines.cjs`.
 */
const { app, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const src = path.join(__dirname, '..', '..', 'docs', 'screens')
const dst = path.join(__dirname, '..', 'test', 'visual', 'baseline')
const CROP = new Set(['30-settings.png', '36-light-settings.png'])

app.whenReady().then(() => {
  fs.mkdirSync(dst, { recursive: true })
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith('.png'))) {
    if (CROP.has(f)) {
      const img = nativeImage.createFromPath(path.join(src, f))
      fs.writeFileSync(path.join(dst, f), img.crop({ x: 0, y: 0, width: 2200, height: 1640 }).toPNG())
    } else fs.copyFileSync(path.join(src, f), path.join(dst, f))
  }
  app.quit()
})
