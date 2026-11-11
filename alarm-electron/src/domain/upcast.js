/**
 * upcast(raw) brings a stored journal event to the current schema version (`EVENT_VERSION`).
 * Unknown or hopeless records return null and are skipped by the journal (§2.7).
 *
 * Version history:
 *   v0 (no `v` field) — events written before versioning; `SettingsChanged` lacked `openAtLogin`
 *                       and `AlarmSaved` could miss optional fields.
 *   v1 — current.
 */

import { EVENT_VERSION } from '../contract/events.js'
import { defaultSettings } from './defaults.js'
import { RAMP_OPTIONS, GRACE_OPTIONS } from './schedule.js'

/** @typedef {import('../contract/events.js').JournalEvent} JournalEvent */
/** @typedef {import('../contract/events.js').Settings} Settings */

/**
 * Field-by-field repair: a broken setting falls back to its default instead of losing the record (§2.7).
 * @param {unknown} raw
 * @returns {Settings}
 */
export function repairSettings(raw) {
  const d = defaultSettings()
  if (typeof raw !== 'object' || raw === null) return d
  const r = /** @type {Record<string, any>} */ (raw)
  const int = (/** @type {unknown} */ v, /** @type {number} */ lo, /** @type {number} */ hi) =>
    typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
  const isRef = (/** @type {any} */ v) =>
    v &&
    (v.kind === 'builtin' || v.kind === 'custom') &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    Object.keys(v).length === 2
  const isTask = (/** @type {any} */ v) =>
    v &&
    ['none', 'math', 'retype'].includes(v.type) &&
    ['easy', 'medium', 'hard'].includes(v.difficulty) &&
    int(v.count, 1, 5) &&
    Object.keys(v).length === 3
  return {
    theme: ['system', 'light', 'dark'].includes(r.theme) ? r.theme : d.theme,
    hourCycle: ['auto', '12h', '24h'].includes(r.hourCycle) ? r.hourCycle : d.hourCycle,
    snoozeMinutes: int(r.snoozeMinutes, 1, 30) ? r.snoozeMinutes : d.snoozeMinutes,
    rampSeconds: /** @type {readonly number[]} */ (RAMP_OPTIONS).includes(r.rampSeconds) ? r.rampSeconds : d.rampSeconds,
    volume: typeof r.volume === 'number' && r.volume >= 0.05 && r.volume <= 1 ? r.volume : d.volume,
    defaultSound: isRef(r.defaultSound) ? r.defaultSound : d.defaultSound,
    defaultTask: isTask(r.defaultTask) ? r.defaultTask : d.defaultTask,
    keepAwake: typeof r.keepAwake === 'boolean' ? r.keepAwake : d.keepAwake,
    missedGraceMinutes: /** @type {readonly number[]} */ (GRACE_OPTIONS).includes(r.missedGraceMinutes)
      ? r.missedGraceMinutes
      : d.missedGraceMinutes,
    openAtLogin: typeof r.openAtLogin === 'boolean' ? r.openAtLogin : d.openAtLogin,
  }
}

/**
 * @param {unknown} raw parsed JSON of one journal line
 * @returns {JournalEvent | null} the event at the current version (still to be schema-checked), or null
 */
export function upcast(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  /** @type {Record<string, any>} */
  let e = { ...raw }
  if (typeof e.type !== 'string') return null
  const version = e.v === undefined ? 0 : e.v
  if (typeof version !== 'number' || version > EVENT_VERSION) return null
  if (typeof e.at !== 'number') return null

  if (version < 1) e = fromV0(e)
  // Settings are repaired at every version: a broken field must not cost the whole record.
  if (e.type === 'SettingsChanged') e = { ...e, settings: repairSettings(e.settings) }
  return /** @type {JournalEvent} */ (e)
}

/** @param {Record<string, any>} e */
function fromV0(e) {
  /** @type {Record<string, any>} */
  const out = { ...e, v: 1 }
  if (out.type === 'AlarmSaved' && out.alarm && typeof out.alarm === 'object') {
    out.alarm = {
      label: '',
      days: [],
      snoozeUntil: null,
      ringingSince: null,
      ...out.alarm,
    }
  }
  return out
}
