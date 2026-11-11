import { defaultSettings, initialState } from '../../src/domain/defaults.js'
import { nextOccurrence } from '../../src/domain/schedule.js'

/** Local-time timestamp. 2026-11-02 is a Monday. */
export const at = (/** @type {number} */ y, /** @type {number} */ mo, /** @type {number} */ d, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).getTime()

/**
 * @param {Partial<import('../../src/contract/events.js').Alarm>} [patch]
 * @returns {import('../../src/contract/events.js').Alarm}
 */
export function alarm(patch = {}) {
  const s = defaultSettings()
  const base = {
    id: 'a1',
    hour: 7,
    minute: 30,
    label: '',
    enabled: true,
    days: /** @type {number[]} */ ([]),
    sound: s.defaultSound,
    volume: s.volume,
    rampSeconds: s.rampSeconds,
    snooze: true,
    task: s.defaultTask,
    createdAt: at(2026, 11, 2, 12),
    nextTriggerAt: /** @type {number | null} */ (null),
    snoozeUntil: /** @type {number | null} */ (null),
    ringingSince: /** @type {number | null} */ (null),
  }
  const a = { ...base, ...patch }
  if (!('nextTriggerAt' in patch) && a.enabled) a.nextTriggerAt = nextOccurrence(a, a.createdAt)
  return a
}

/** @param {Partial<import('../../src/domain/defaults.js').State>} [patch] */
export const state = (patch = {}) => ({ ...initialState(), ...patch })

/** Deterministic rng returning a fixed sequence (cycled). @param {number[]} values */
export const fixedRng = (values) => {
  let i = 0
  return () => values[i++ % values.length]
}
