/** Volume ramp and fades (ALARM_SPEC.md §3.9). */

/** The ramp starts almost silent: 1.5 % of the target volume. */
export const MIN_LEVEL = 0.015
/** Fade-out when a sound stops in general. */
export const FADE_MS = 120
/** Fade-out when an alarm is turned off. */
export const ALARM_FADE_MS = 250
/** Timer alert: fixed volume and ramp (§3.10). */
export const TIMER_VOLUME = 0.9
export const TIMER_RAMP_SECONDS = 3

/**
 * gain(t) = volume × (0.015 + 0.985 × x²), x = t / rampSeconds clamped to [0, 1].
 * @param {number} volume
 * @param {number} rampSeconds
 * @param {number} t seconds since start
 */
export function gainAt(volume, rampSeconds, t) {
  if (rampSeconds <= 0) return volume
  const x = Math.min(1, Math.max(0, t / rampSeconds))
  return volume * (MIN_LEVEL + (1 - MIN_LEVEL) * x * x)
}

/**
 * Sampled curve for `GainNode.setValueCurveAtTime`.
 * @param {number} volume
 * @param {number} [points]
 */
export function rampCurve(volume, points = 128) {
  const curve = new Float32Array(points)
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1)
    curve[i] = volume * (MIN_LEVEL + (1 - MIN_LEVEL) * x * x)
  }
  return curve
}
