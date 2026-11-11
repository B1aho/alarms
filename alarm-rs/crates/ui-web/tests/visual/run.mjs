// Visual tests of ui-web (TZ_RUST 8): renders the 36 reference screens of docs/screens
// with the fake daemon in headless WebKit (1100×820, scale 2) and compares them pixel by pixel.
//   node run.mjs [--build] [--only 03,16] [--browser webkit|chromium] [--limit 1]
// Exit code 1 when a screen differs by more than the limit (% of pixels outside the masks).
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import * as pw from 'playwright'
import { checkWidgets } from './interactions.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const crate = resolve(here, '../..')
const dist = join(crate, 'dist')
const refs = resolve(crate, '../../../docs/screens')
const out = join(here, 'out')
const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const LIMIT = Number(arg('--limit', '1'))
const only = arg('--only', '')?.split(',').filter(Boolean)
const browserName = arg('--browser', 'webkit')
// Headless WebKit leaves `backdrop-filter` out of screenshots; see styles/animations.css.
const SHIM = args.includes('--no-shim') ? '' : '&shim=backdrop'

if (args.includes('--build') || !existsSync(join(dist, 'index.html'))) {
  execFileSync('trunk', ['build', '--offline'], { cwd: crate, stdio: 'inherit' })
}

const T = (h, m) => Date.UTC(2026, 10, 10, h, m, 0)
const N51 = T(11, 51) + 5000
const N52 = T(11, 52) + 5000

// name → query (fixture, page, opened screen) and the clock; masks are CSS-pixel rectangles.
const CLOCK_MASK = { x: 960, y: 0, w: 140, h: 52 }
const RING_TIME_MASK = { x: 380, y: 150, w: 340, h: 170 }
const SCENES = {
  '01-alarms-empty': { q: 'fixture=empty' },
  '02-alarms-notifications-banner': { q: 'fixture=banner' },
  '03-alarms-list': { q: 'fixture=list' },
  '04-alarms-edit-mode': { q: 'fixture=list&open=edit-mode' },
  '05-alarms-edit-delete-confirm': { q: 'fixture=list&open=edit-mode:gym', hover: '.alarm-row:nth-of-type(2)' },
  '06-editor-add': { q: 'fixture=list&open=editor-new' },
  '07-editor-repeat': { q: 'fixture=list&open=editor-new:repeat' },
  '08-editor-sound': { q: 'fixture=list&open=editor-new:sound' },
  '09-editor-gradual-volume': { q: 'fixture=list&open=editor-new:ramp' },
  '10-editor-turn-off-task': { q: 'fixture=list&open=editor-new:task&example=' + encodeURIComponent('5 × 25 + 15') },
  '11-editor-turn-off-retype': { q: 'fixture=list&newtask=retype&open=editor-new:task&example=6G3F%208QZ7%20GZ' },
  '12-editor-turn-off-none': { q: 'fixture=list&newtask=none&open=editor-new:task' },
  '13-editor-edit-existing-bottom': { q: 'fixture=list&open=editor:work:bottom' },
  '14-alarms-list-12h': { q: 'fixture=list&cycle=12h' },
  '15-editor-add-12h': { q: 'fixture=list&cycle=12h&open=editor-new' },
  '16-ringing': { q: 'fixture=ringing', mask: [RING_TIME_MASK] },
  '17-ringing-task-math': { q: 'fixture=ringing-math', mask: [RING_TIME_MASK] },
  '18-ringing-task-wrong-answer': { q: 'fixture=ringing-wrong', mask: [RING_TIME_MASK] },
  '19-ringing-no-snooze': { q: 'fixture=ringing-nosnooze', mask: [RING_TIME_MASK] },
  '20-ringing-task-retype': { q: 'fixture=ringing-retype', mask: [RING_TIME_MASK] },
  '21-stopwatch-idle': { q: 'fixture=list&page=stopwatch' },
  '22-stopwatch-running-laps': { q: 'fixture=sw-laps&page=stopwatch' },
  '23-stopwatch-stopped': { q: 'fixture=sw-stopped&page=stopwatch' },
  '24-timer-idle': { q: 'fixture=list&page=timer' },
  '25-timer-idle-recents': { q: 'fixture=timer-recents&page=timer', full: true },
  '26-timer-running': { q: 'fixture=timer-running&page=timer' },
  '27-timer-paused': { q: 'fixture=timer-paused&page=timer' },
  '28-timer-sound-sheet': { q: 'fixture=timer-paused&page=timer&open=timer-sound' },
  '29-timer-done': { q: 'fixture=timer-done&page=timer' },
  // Settings: the first window is compared; RELIABILITY differs by TZ_RUST 3.3–3.6 and is masked.
  '30-settings': { q: 'fixture=list&page=settings', now: N52, reliability: true },
  '31-settings-default-sound': { q: 'fixture=list&page=settings&open=default-sound', now: N52 },
  '32-light-alarms-list': { q: 'fixture=list&theme=light', now: N52 },
  '33-light-editor': { q: 'fixture=list&theme=light&open=editor-new', now: N52 },
  '34-light-timer': { q: 'fixture=list&theme=light&page=timer', now: N52 },
  '35-light-stopwatch': { q: 'fixture=list&theme=light&page=stopwatch', now: N52 },
  '36-light-settings': { q: 'fixture=list&theme=light&page=settings', now: N52, reliability: true },
}

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css' }
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const f = join(root, p)
    if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

function maskOut(a, b, rects, scale) {
  for (const r of rects) {
    for (let y = Math.max(0, r.y * scale); y < Math.min(a.height, (r.y + r.h) * scale); y++) {
      for (let x = Math.max(0, r.x * scale); x < Math.min(a.width, (r.x + r.w) * scale); x++) {
        const i = (y * a.width + x) * 4
        for (let k = 0; k < 4; k++) b.data[i + k] = a.data[i + k]
      }
    }
  }
}

function crop(png, w, h) {
  const c = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) png.data.copy(c.data, y * w * 4, y * png.width * 4, y * png.width * 4 + w * 4)
  return c
}

const server = await serve(dist)
const base = `http://127.0.0.1:${server.address().port}/`
const browser = await pw[browserName].launch({ headless: true })
mkdirSync(join(out, 'actual'), { recursive: true })
mkdirSync(join(out, 'diff'), { recursive: true })
mkdirSync(join(out, 'other-theme'), { recursive: true })

const rows = []
let failed = 0
for (const [name, s] of Object.entries(SCENES)) {
  if (only?.length && !only.some((o) => name.startsWith(o))) continue
  const ref = PNG.sync.read(readFileSync(join(refs, `${name}.png`)))
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 820 },
    deviceScaleFactor: 2,
    timezoneId: 'UTC',
    colorScheme: 'dark',
    locale: 'en-US',
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const now = s.now ?? N51
  await page.goto(`${base}?${s.q}&now=${now}${SHIM}`)
  await page.waitForSelector('.app-root, .ringing', { timeout: 15000 })
  if (s.hover) await page.hover(s.hover).catch(() => {})
  else await page.mouse.move(1099, 819)
  await page.waitForTimeout(500)
  let mask = [...(s.mask ?? []), CLOCK_MASK]
  if (s.reliability) {
    const box = await page.evaluate(() => {
      const h = [...document.querySelectorAll('.section-header')].find((e) => e.textContent === 'RELIABILITY')
      const r = h?.closest('.section')?.getBoundingClientRect()
      return r ? { y: r.top } : null
    })
    if (box) mask.push({ x: 0, y: Math.floor(box.y) - 4, w: 1100, h: 2000 })
  }
  const shot = await page.screenshot({ fullPage: !!s.full })
  writeFileSync(join(out, 'actual', `${name}.png`), shot)
  let act = PNG.sync.read(shot)
  let refImg = ref
  const w = Math.min(act.width, ref.width)
  const h = Math.min(act.height, ref.height)
  if (act.width !== w || act.height !== h) act = crop(act, w, h)
  if (ref.width !== w || ref.height !== h) refImg = crop(ref, w, h)
  maskOut(refImg, act, mask, 2)
  const diff = new PNG({ width: w, height: h })
  const n = pixelmatch(refImg.data, act.data, diff.data, w, h, { threshold: 0.1 })
  writeFileSync(join(out, 'diff', `${name}.png`), PNG.sync.write(diff))
  const pct = (n / (w * h)) * 100
  const sizeNote = ref.height !== shot.readUInt32BE(20) ? ` (ref ${ref.width}×${ref.height}, got ${act.width}×${shot.readUInt32BE(20)})` : ''
  const ok = pct <= LIMIT && errors.length === 0
  if (!ok) failed++
  rows.push({ name, pct, ok, note: (errors[0] ?? '') + sizeNote })

  // The other theme, kept as an artifact.
  const other = name.includes('light') ? 'dark' : 'light'
  if (!/^1[6-9]|^20/.test(name)) {
    await page.goto(`${base}?${s.q.replace(/&theme=\w+/, '')}&theme=${other}&now=${now}${SHIM}`)
    await page.waitForSelector('.app-root', { timeout: 15000 })
    await page.waitForTimeout(300)
    writeFileSync(join(out, 'other-theme', `${name}-${other}.png`), await page.screenshot({ fullPage: !!s.full }))
  }
  await ctx.close()
}
const widgetResults = args.includes('--no-widgets') ? [] : await checkWidgets(browser, base)
await browser.close()
server.close()

console.log(`\nVisual comparison (${browserName}, limit ${LIMIT}% of pixels):`)
console.log('screen                              diff %   result')
for (const r of rows) {
  console.log(`${r.name.padEnd(34)} ${r.pct.toFixed(2).padStart(7)}   ${r.ok ? 'ok' : 'FAIL'} ${r.note}`)
}
if (widgetResults.length) {
  console.log('\nWidget interactions (?gallery=1):')
  for (const r of widgetResults) {
    if (!r.ok) failed++
    console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`)
  }
}
const avg = rows.reduce((a, r) => a + r.pct, 0) / Math.max(1, rows.length)
console.log(`\n${rows.length - failed}/${rows.length} within ${LIMIT}%, mean ${avg.toFixed(2)}%. Renders: ${out}`)
process.exit(failed ? 1 : 0)
