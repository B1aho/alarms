/**
 * Built-in sounds (ALARM_SPEC §3.8), synthesised once into loopable AudioBuffers.
 * Ported from the reference `alarm/src/shared/audio/tones.ts`.
 */

const SAMPLE_RATE = 44100

/**
 * @typedef {object} NoteOpts
 * @property {number} freq
 * @property {number} start
 * @property {number} dur
 * @property {OscillatorType} [type]
 * @property {number} [gain]
 * @property {number} [attack]
 */

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} dest
 * @param {NoteOpts} o
 */
function note(ctx, dest, { freq, start, dur, type = 'sine', gain = 0.3, attack = 0.01 }) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g).connect(dest)
  osc.start(start)
  osc.stop(start + dur + 0.05)
}

/** Bell partials: ratio, amplitude, decay share of the duration (§3.8). */
export const BELL_PARTIALS = /** @type {const} */ ([
  [1, 1, 1],
  [2, 0.5, 0.7],
  [2.76, 0.35, 0.5],
  [5.4, 0.15, 0.3],
])

/**
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} dest
 * @param {number} freq
 * @param {number} start
 * @param {number} dur
 * @param {number} [gain]
 */
function bell(ctx, dest, freq, start, dur, gain = 0.25) {
  for (const [ratio, amp, decay] of BELL_PARTIALS) {
    note(ctx, dest, { freq: freq * ratio, start, dur: dur * decay, gain: gain * amp, attack: 0.005 })
  }
}

const hz = (/** @type {number} */ midi) => 440 * 2 ** ((midi - 69) / 12)

/** @typedef {(ctx: BaseAudioContext, out: AudioNode) => void} Renderer */

/** @type {Record<string, { length: number, render: Renderer }>} */
export const PATTERNS = {
  sunrise: {
    length: 4.8,
    render(ctx, out) {
      ;[72, 76, 79, 84, 79, 76].forEach((m, i) => bell(ctx, out, hz(m), i * 0.4, 2.2, 0.22))
      ;[67, 71, 74].forEach((m, i) => bell(ctx, out, hz(m + 12), 2.6 + i * 0.35, 1.8, 0.16))
    },
  },
  harp: {
    length: 3.2,
    render(ctx, out) {
      ;[60, 64, 67, 71, 72, 76, 79, 83].forEach((m, i) =>
        note(ctx, out, { freq: hz(m), start: i * 0.11, dur: 1.9, type: 'triangle', gain: 0.22 }),
      )
      ;[84, 79, 76].forEach((m, i) =>
        note(ctx, out, { freq: hz(m), start: 1.5 + i * 0.18, dur: 1.4, type: 'triangle', gain: 0.18 }),
      )
    },
  },
  chimes: {
    length: 3.6,
    render(ctx, out) {
      /** @type {Array<[number, number]>} */
      const seq = [
        [79, 0],
        [76, 0.45],
        [72, 0.9],
        [74, 1.35],
        [81, 1.95],
        [79, 2.4],
      ]
      seq.forEach(([m, t]) => bell(ctx, out, hz(m), t, 1.1, 0.2))
    },
  },
  beacon: {
    length: 2,
    render(ctx, out) {
      for (let i = 0; i < 4; i++) {
        note(ctx, out, { freq: 1046.5, start: i * 0.16, dur: 0.12, gain: 0.32, attack: 0.004 })
        note(ctx, out, { freq: 1568, start: i * 0.16, dur: 0.1, gain: 0.08, attack: 0.004 })
      }
    },
  },
  pulse: {
    length: 1.6,
    render(ctx, out) {
      for (let i = 0; i < 3; i++)
        note(ctx, out, { freq: 1000, start: i * 0.2, dur: 0.12, type: 'square', gain: 0.12, attack: 0.002 })
    },
  },
  classic: {
    length: 2,
    render(ctx, out) {
      for (let i = 0; i < 24; i++) bell(ctx, out, i % 2 ? 1760 : 1975.5, i * 0.05, 0.18, 0.12)
    },
  },
}

/** @type {Map<string, Promise<AudioBuffer>>} */
const cache = new Map()

/** @param {string} id built-in sound id; unknown ids fall back to Sunrise */
export function renderBuiltin(id) {
  const key = id in PATTERNS ? id : 'sunrise'
  let p = cache.get(key)
  if (!p) {
    const pattern = PATTERNS[key]
    const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * pattern.length), SAMPLE_RATE)
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    pattern.render(ctx, master)
    p = ctx.startRendering()
    cache.set(key, p)
  }
  return p
}
