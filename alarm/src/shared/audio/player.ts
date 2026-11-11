import { getAudioContext } from './context'
import { loadSoundBuffer } from './library'
import { DEFAULT_SOUND, type SoundRef } from './sounds'

export interface PlaybackOptions {
  /** Final volume 0..1 */
  volume: number
  /** Seconds to go from near-silence to `volume`. 0 = full volume immediately. */
  rampSeconds: number
  loop?: boolean
  onEnded?: () => void
}

export interface Playback {
  stop(fadeMs?: number): void
}

const MIN_LEVEL = 0.015

/**
 * Smooth volume ramp: a quadratic curve feels linear to the ear and starts
 * genuinely quiet, unlike a linear gain ramp which jumps quickly.
 */
export function rampCurve(volume: number, points = 128): Float32Array {
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1)
    curve[i] = volume * (MIN_LEVEL + (1 - MIN_LEVEL) * x * x)
  }
  return curve
}

/** Starts playback immediately (loading happens in the background). Safe to stop at any time. */
export function startPlayback(ref: SoundRef, opts: PlaybackOptions): Playback {
  let stopped = false
  let source: AudioBufferSourceNode | null = null
  let gain: GainNode | null = null
  const ctx = getAudioContext()

  void (async () => {
    if (!ctx) return
    let buffer: AudioBuffer
    try {
      buffer = await loadSoundBuffer(ref)
    } catch {
      buffer = await loadSoundBuffer(DEFAULT_SOUND)
    }
    if (stopped) return
    if (ctx.state !== 'running') await ctx.resume().catch(() => {})
    if (stopped) return

    source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = opts.loop ?? true
    gain = ctx.createGain()
    const t0 = ctx.currentTime
    const volume = Math.min(1, Math.max(0, opts.volume))
    if (opts.rampSeconds > 0) {
      gain.gain.setValueAtTime(volume * MIN_LEVEL, t0)
      gain.gain.setValueCurveAtTime(rampCurve(volume), t0, opts.rampSeconds)
    } else {
      gain.gain.setValueAtTime(volume, t0)
    }
    source.connect(gain).connect(ctx.destination)
    source.onended = () => opts.onEnded?.()
    source.start()
  })()

  return {
    stop(fadeMs = 120) {
      if (stopped) return
      stopped = true
      if (!ctx || !source || !gain) return
      const now = ctx.currentTime
      const end = now + fadeMs / 1000
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, end)
      source.onended = null
      source.stop(end + 0.02)
    },
  }
}
