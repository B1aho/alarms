/** Loading and test-decoding of music files (§3.8): the file is accepted only if it actually decodes. */

/** @param {ArrayBuffer} data */
export function decode(data) {
  // An OfflineAudioContext decodes without a running output device.
  const ctx = new OfflineAudioContext(2, 1, 44100)
  return ctx.decodeAudioData(data)
}

/** @param {string} url */
export async function loadUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return decode(await res.arrayBuffer())
}

/** @type {Map<string, Promise<AudioBuffer>>} */
const cache = new Map()

/** Decoded custom sound, cached by URL. @param {string} url */
export function loadCached(url) {
  let p = cache.get(url)
  if (!p) {
    p = loadUrl(url)
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

/**
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function probe(url) {
  try {
    const buf = await loadUrl(url)
    return buf.duration > 0
  } catch {
    return false
  }
}
