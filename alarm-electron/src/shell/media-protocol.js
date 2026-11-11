/**
 * Custom protocols:
 *  - `app://alarm/…`          app code for the renderers, read from `src/` (ui, audio and the shared modules they import);
 *  - `alarm-media://sounds/…` imported music files from `userData/sounds/` (TZ §6, 3.8).
 * Everything is local: CSP forbids any network access.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { APP_HOST, APP_SCHEME, MEDIA_SCHEME, SOUND_FILE_RE } from '../contract/channels.js'

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `media-src 'self' ${MEDIA_SCHEME}:`,
  `connect-src 'self' ${MEDIA_SCHEME}:`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

const MIME = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
})

/** Top-level folders of `src/` the renderers may load. Never shell/, engine/ or preload/. */
const SERVED = new Set(['ui', 'audio', 'domain', 'contract'])

export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } },
    {
      scheme: MEDIA_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ])
}

const notFound = () => new Response('Not found', { status: 404 })

/**
 * @param {{ srcDir: string, soundsDir: string }} dirs
 */
export function handleProtocols({ srcDir, soundsDir }) {
  protocol.handle(APP_SCHEME, async (req) => {
    const url = new URL(req.url)
    if (url.host !== APP_HOST) return notFound()
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const top = rel.split('/')[0]
    if (!SERVED.has(top)) return notFound()
    const file = path.resolve(srcDir, rel)
    if (!file.startsWith(path.resolve(srcDir) + path.sep)) return notFound()
    try {
      const body = await fs.readFile(file)
      const ext = path.extname(file)
      /** @type {Record<string, string>} */
      const headers = { 'content-type': MIME[ext] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' }
      if (ext === '.html') headers['content-security-policy'] = CSP
      return new Response(body, { headers })
    } catch {
      return notFound()
    }
  })

  protocol.handle(MEDIA_SCHEME, async (req) => {
    const url = new URL(req.url)
    const name = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    if (url.host !== 'sounds' || !SOUND_FILE_RE.test(name)) return notFound()
    const file = path.join(soundsDir, name)
    try {
      await fs.access(file)
    } catch {
      return notFound()
    }
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('content-type', MIME[path.extname(name)] ?? 'application/octet-stream')
    headers.set('access-control-allow-origin', `${APP_SCHEME}://${APP_HOST}`)
    return new Response(res.body, { status: res.status, headers })
  })
}

/** @param {string} page e.g. `ui/index.html` */
export const appUrl = (page) => `${APP_SCHEME}://${APP_HOST}/${page}`
