/**
 * Entry of the hidden `audio` renderer: plays every sound (alarms, timer, previews) and probes files.
 * Commands arrive from the engine over the bus and are validated on entry.
 *
 * Restart safety: after the engine restarts it re-sends PlaySound for everything that must play;
 * an identical PlaySound for a key that is already playing is a no-op, and sounds the new engine
 * does not confirm within 2 s are faded out.
 */

import { SUBSCRIPTIONS } from '../contract/channels.js'
import { checkMessage } from '../contract/schemas/validate.js'
import { FADE_MS, MIN_LEVEL, rampCurve } from '../domain/ramp.js'
import { loadCached, probe } from './probe.js'
import { PATTERNS, renderBuiltin } from './synth.js'

/**
 * @typedef {{ send: (msg: unknown) => void, on: (fn: (msg: any) => void) => () => void, onReconnect: (fn: () => void) => () => void }} Bus
 */
const bus = /** @type {Bus} */ (/** @type {any} */ (window).bus)

const ctx = new AudioContext({ latencyHint: 'playback' })

/**
 * @typedef {object} Spec
 * @property {{ kind: 'builtin' | 'custom', id: string }} sound
 * @property {string | null} url
 * @property {number} volume
 * @property {number} rampSeconds
 * @property {boolean} loop
 */

/**
 * @typedef {object} Playing
 * @property {string} signature
 * @property {boolean} confirmed
 * @property {GainNode | null} gain
 * @property {number} startedAt ctx.currentTime at start (−1 while loading)
 * @property {Spec} spec
 * @property {(fadeMs: number) => void} stop
 */

/** @type {Map<string, Playing>} */
const playing = new Map()

/** @param {Spec} spec @returns {Promise<AudioBuffer>} */
async function bufferFor(spec) {
  if (spec.sound.kind === 'custom' && spec.url) {
    try {
      return await loadCached(spec.url)
    } catch {
      return renderBuiltin('sunrise') // missing or broken file → Sunrise (§3.8)
    }
  }
  return renderBuiltin(spec.sound.id)
}

/**
 * Starts immediately (loading in the background); safe to stop at any moment.
 * @param {string} key
 * @param {Spec} spec
 * @param {() => void} [onEnded]
 * @returns {Playing}
 */
function start(key, spec, onEnded) {
  let stopped = false
  /** @type {AudioBufferSourceNode | null} */
  let source = null
  /** @type {Playing} */
  const entry = {
    signature: JSON.stringify(spec),
    confirmed: true,
    gain: null,
    startedAt: -1,
    spec,
    stop(fadeMs) {
      if (stopped) return
      stopped = true
      const g = entry.gain
      if (!source || !g) return
      const now = ctx.currentTime
      const end = now + fadeMs / 1000
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(g.gain.value, now)
      g.gain.linearRampToValueAtTime(0, end)
      source.onended = null
      source.stop(end + 0.02)
    },
  }
  void (async () => {
    const buffer = await bufferFor(spec)
    if (stopped) return
    if (ctx.state !== 'running') await ctx.resume().catch(() => {})
    if (stopped) return
    source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = spec.loop
    const gain = ctx.createGain()
    const t0 = ctx.currentTime
    const volume = Math.min(1, Math.max(0, spec.volume))
    if (spec.rampSeconds > 0) {
      gain.gain.setValueAtTime(volume * MIN_LEVEL, t0)
      gain.gain.setValueCurveAtTime(rampCurve(volume), t0, spec.rampSeconds)
    } else {
      gain.gain.setValueAtTime(volume, t0)
    }
    source.connect(gain).connect(ctx.destination)
    source.onended = () => {
      if (playing.get(key) === entry) playing.delete(key)
      onEnded?.()
    }
    entry.gain = gain
    entry.startedAt = t0
    source.start()
  })()
  return entry
}

/** @param {string} key @param {Spec} spec */
function play(key, spec) {
  const current = playing.get(key)
  const signature = JSON.stringify(spec)
  if (current && current.signature === signature) {
    current.confirmed = true
    return
  }
  current?.stop(FADE_MS)
  playing.set(key, start(key, spec))
}

/** @param {string} key @param {number} fadeMs */
function stop(key, fadeMs) {
  const p = playing.get(key)
  if (!p) return
  playing.delete(key)
  p.stop(fadeMs)
}

bus.on((msg) => {
  const check = checkMessage(msg, SUBSCRIPTIONS.audio)
  if (!check.ok) {
    console.warn(`[audio] dropped message: ${check.reason}`)
    return
  }
  switch (msg.type) {
    case 'PlaySound':
      play(msg.key, msg)
      break
    case 'StopSound':
      stop(msg.key, msg.fadeMs)
      break
    case 'PreviewPlay':
      stop('preview', FADE_MS)
      playing.set('preview', start('preview', msg))
      break
    case 'PreviewStop':
      stop('preview', FADE_MS)
      break
    case 'ProbeSound':
      void probe(msg.url).then((ok) => bus.send({ type: 'ProbeResult', probeId: msg.probeId, ok }))
      break
  }
})

bus.onReconnect(() => {
  for (const [key, p] of playing) if (key !== 'preview') p.confirmed = false
  setTimeout(() => {
    for (const [key, p] of playing) if (!p.confirmed) stop(key, FADE_MS)
  }, 2000)
})

document.addEventListener('visibilitychange', () => void ctx.resume().catch(() => {}))

/** Inspection hooks for the e2e tests (read-only). */
Object.assign(window, {
  __audio: {
    state: () => ctx.state,
    keys: () => [...playing.keys()],
    /** @param {string} key */
    gain: (key) => playing.get(key)?.gain?.gain.value ?? null,
    /** @param {string} key */
    elapsed: (key) => {
      const p = playing.get(key)
      return p && p.startedAt >= 0 ? ctx.currentTime - p.startedAt : null
    },
    /** @param {string} key */
    spec: (key) => playing.get(key)?.spec ?? null,
    /** @param {string} id */
    async describe(id) {
      const b = await renderBuiltin(id)
      const data = b.getChannelData(0)
      let peak = 0
      /** @type {number[]} */
      const onsets = []
      const win = Math.round(b.sampleRate * 0.01)
      let prev = 0
      for (let i = 0; i < data.length; i += win) {
        let e = 0
        for (let j = i; j < Math.min(data.length, i + win); j++) e = Math.max(e, Math.abs(data[j]))
        peak = Math.max(peak, e)
        if (e > 0.02 && e > prev * 1.8) onsets.push(Math.round((i / b.sampleRate) * 100) / 100)
        prev = e
      }
      return { duration: b.duration, peak, onsets, length: PATTERNS[id]?.length ?? null }
    },
  },
})
