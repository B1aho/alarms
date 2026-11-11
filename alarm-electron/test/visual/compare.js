/**
 * Pixel comparison with masks applied to BOTH images (reference and actual), so masked
 * time-dependent zones never count as differences. Diff images go to test-results/visual/.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { ROOT } from '../e2e/helpers.js'

export const BASELINE_DIR = path.join(ROOT, 'test', 'visual', 'baseline')
const OUT_DIR = path.join(ROOT, 'test-results', 'visual')

/** @param {PNG} img @param {Array<{ x: number, y: number, width: number, height: number }>} rects */
function paint(img, rects) {
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width))
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height))
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4
        img.data[i] = 255
        img.data[i + 1] = 0
        img.data[i + 2] = 255
        img.data[i + 3] = 255
      }
  }
}

/**
 * @param {string} name baseline file name (png)
 * @param {Buffer} actualPng
 * @param {Array<{ x: number, y: number, width: number, height: number }>} masks device pixels
 * @returns {{ ratio: number, diffPixels: number, created: boolean, sizeMismatch?: string }}
 */
export function compareWithBaseline(name, actualPng, masks) {
  const basePath = path.join(BASELINE_DIR, name)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  if (!fs.existsSync(basePath)) {
    fs.writeFileSync(basePath, actualPng)
    return { ratio: 0, diffPixels: 0, created: true }
  }
  const base = PNG.sync.read(fs.readFileSync(basePath))
  const actual = PNG.sync.read(actualPng)
  if (base.width !== actual.width || base.height !== actual.height) {
    fs.writeFileSync(path.join(OUT_DIR, name.replace('.png', '-actual.png')), actualPng)
    return {
      ratio: 1,
      diffPixels: -1,
      created: false,
      sizeMismatch: `${actual.width}x${actual.height} vs ${base.width}x${base.height}`,
    }
  }
  paint(base, masks)
  paint(actual, masks)
  const diff = new PNG({ width: base.width, height: base.height })
  const diffPixels = pixelmatch(base.data, actual.data, diff.data, base.width, base.height, { threshold: 0.1 })
  const ratio = diffPixels / (base.width * base.height)
  fs.writeFileSync(path.join(OUT_DIR, name.replace('.png', '-actual.png')), PNG.sync.write(actual))
  fs.writeFileSync(path.join(OUT_DIR, name.replace('.png', '-diff.png')), PNG.sync.write(diff))
  return { ratio, diffPixels, created: false }
}
