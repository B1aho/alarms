import type { BuiltinSoundId } from './sounds'

/**
 * Built-in alarm sounds are synthesised once into loopable AudioBuffers, so the
 * app ships no audio assets and works fully offline.
 */

const SAMPLE_RATE = 44100

interface NoteOpts {
  freq: number
  start: number
  dur: number
  type?: OscillatorType
  gain?: number
  attack?: number
}

function note(ctx: BaseAudioContext, dest: AudioNode, { freq, start, dur, type = 'sine', gain = 0.3, attack = 0.01 }: NoteOpts) {
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

/** Bell: a few inharmonic partials with fast decay on the upper ones. */
function bell(ctx: BaseAudioContext, dest: AudioNode, freq: number, start: number, dur: number, gain = 0.25) {
  const partials: Array<[number, number, number]> = [
    [1, 1, 1],
    [2, 0.5, 0.7],
    [2.76, 0.35, 0.5],
    [5.4, 0.15, 0.3],
  ]
  for (const [ratio, amp, decay] of partials) {
    note(ctx, dest, { freq: freq * ratio, start, dur: dur * decay, gain: gain * amp, attack: 0.005 })
  }
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

type Renderer = (ctx: OfflineAudioContext, out: AudioNode) => void

const PATTERNS: Record<BuiltinSoundId, { length: number; render: Renderer }> = {
  sunrise: {
    length: 4.8,
    render(ctx, out) {
      const seq = [72, 76, 79, 84, 79, 76]
      seq.forEach((m, i) => bell(ctx, out, hz(m), i * 0.4, 2.2, 0.22))
      ;[67, 71, 74].forEach((m, i) => bell(ctx, out, hz(m + 12), 2.6 + i * 0.35, 1.8, 0.16))
    },
  },
  harp: {
    length: 3.2,
    render(ctx, out) {
      const seq = [60, 64, 67, 71, 72, 76, 79, 83]
      seq.forEach((m, i) => note(ctx, out, { freq: hz(m), start: i * 0.11, dur: 1.9, type: 'triangle', gain: 0.22 }))
      ;[84, 79, 76].forEach((m, i) =>
        note(ctx, out, { freq: hz(m), start: 1.5 + i * 0.18, dur: 1.4, type: 'triangle', gain: 0.18 }),
      )
    },
  },
  chimes: {
    length: 3.6,
    render(ctx, out) {
      const seq: Array<[number, number]> = [
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
      for (let i = 0; i < 3; i++) {
        note(ctx, out, { freq: 1000, start: i * 0.2, dur: 0.12, type: 'square', gain: 0.12, attack: 0.002 })
      }
    },
  },
  classic: {
    length: 2,
    render(ctx, out) {
      for (let i = 0; i < 24; i++) {
        const t = i * 0.05
        bell(ctx, out, i % 2 ? 1760 : 1975.5, t, 0.18, 0.12)
      }
    },
  },
}

const cache = new Map<BuiltinSoundId, Promise<AudioBuffer>>()

export function renderBuiltin(id: BuiltinSoundId): Promise<AudioBuffer> {
  let p = cache.get(id)
  if (!p) {
    const pattern = PATTERNS[id] ?? PATTERNS.sunrise
    const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * pattern.length), SAMPLE_RATE)
    const master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
    pattern.render(ctx, master)
    p = ctx.startRendering()
    cache.set(id, p)
  }
  return p
}
