/** Scheduling rules (ALARM_SPEC.md §3.2–3.4). Pure: time is always an argument. */

import { S } from './strings.js'

/** @typedef {import('../contract/events.js').Alarm} Alarm */
/** @typedef {import('../contract/events.js').Settings} Settings */
/** @typedef {import('../contract/commands.js').AlarmDraft} AlarmDraft */

/** Week order used across the UI (Monday first). */
export const WEEK_ORDER = /** @type {const} */ ([1, 2, 3, 4, 5, 6, 0])
export const DAY_SHORT = /** @type {const} */ (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
export const DAY_LONG = /** @type {const} */ (['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])

export const RAMP_OPTIONS = /** @type {const} */ ([0, 15, 30, 60, 120, 300, 600])
export const GRACE_OPTIONS = /** @type {const} */ ([5, 15, 30, 60, 120, 240])
export const SNOOZE_RANGE = /** @type {const} */ ([1, 30])
export const TASK_COUNT_RANGE = /** @type {const} */ ([1, 5])
/** A missed alarm is announced only if it is less late than this. */
export const MISSED_NOTIFY_LIMIT_MS = 12 * 3600_000
/** A timer that ended more than this long ago does not ring. */
export const TIMER_LATE_LIMIT_MS = 10 * 60_000

/**
 * First time strictly after `after` (local time) when the alarm should ring.
 * DST is handled by the local calendar (`Date` with local fields).
 * @param {{ hour: number, minute: number, days: readonly number[] }} a
 * @param {number} after
 */
export function nextOccurrence(a, after) {
  const base = new Date(after)
  for (let i = 0; i <= 8; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, a.hour, a.minute, 0, 0)
    if (d.getTime() <= after) continue
    if (a.days.length === 0 || a.days.includes(d.getDay())) return d.getTime()
  }
  throw new Error('Unreachable: an alarm always occurs within 8 days')
}

/** @param {readonly number[]} days */
export function repeatSummary(days) {
  const set = new Set(days)
  if (set.size === 0) return S.never
  if (set.size === 7) return S.everyDayAll
  const is = (/** @type {number[]} */ ...d) => set.size === d.length && d.every((x) => set.has(x))
  if (is(1, 2, 3, 4, 5)) return S.weekdays
  if (is(0, 6)) return S.weekends
  if (set.size === 1) return S.everyDay(DAY_LONG[[...set][0] ?? 0])
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_SHORT[d])
    .join(' ')
}

/**
 * @typedef {{ kind: 'wait' }
 *   | { kind: 'ring', source: 'schedule' | 'snooze', trigger: number }
 *   | { kind: 'missed', source: 'schedule' | 'snooze', trigger: number }} Verdict
 */

/**
 * The decision table of §3.4 for one alarm at `now`.
 * @param {Alarm} a
 * @param {number} now
 * @param {number} graceMs
 * @returns {Verdict}
 */
export function evaluate(a, now, graceMs) {
  if (a.ringingSince !== null) return { kind: 'wait' }
  if (a.snoozeUntil !== null) {
    if (now < a.snoozeUntil) return { kind: 'wait' }
    return now - a.snoozeUntil > graceMs
      ? { kind: 'missed', source: 'snooze', trigger: a.snoozeUntil }
      : { kind: 'ring', source: 'snooze', trigger: a.snoozeUntil }
  }
  if (!a.enabled || a.nextTriggerAt === null) return { kind: 'wait' }
  const trigger = a.nextTriggerAt
  if (now >= trigger) {
    return now - trigger > graceMs
      ? { kind: 'missed', source: 'schedule', trigger }
      : { kind: 'ring', source: 'schedule', trigger }
  }
  return { kind: 'wait' }
}

/**
 * Schedule after a scheduled ring (or miss): one-shot turns off, repeating moves to the next day.
 * @param {Alarm} a
 * @param {number} trigger
 * @param {number} now
 * @returns {{ enabled: boolean, nextTriggerAt: number | null }}
 */
export function advanceAfterTrigger(a, trigger, now) {
  if (a.days.length === 0) return { enabled: false, nextTriggerAt: null }
  return { enabled: a.enabled, nextTriggerAt: nextOccurrence(a, Math.max(now, trigger)) }
}

/**
 * Soonest upcoming ring among enabled or snoozed alarms.
 * @param {readonly Alarm[]} alarms
 * @returns {{ alarm: Alarm, at: number } | null}
 */
export function nextUpcoming(alarms) {
  /** @type {{ alarm: Alarm, at: number } | null} */
  let best = null
  for (const a of alarms) {
    const at = a.snoozeUntil ?? (a.enabled ? a.nextTriggerAt : null)
    if (at !== null && (!best || at < best.at)) best = { alarm: a, at }
  }
  return best
}

/** Active = enabled or snoozed (§3.2). @param {Alarm} a */
export const isActive = (a) => a.enabled || a.snoozeUntil !== null

/** Sort order of the list: time of day, then creation. @param {Alarm} a @param {Alarm} b */
export const byTime = (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute) || a.createdAt - b.createdAt

/**
 * Editor draft for a new alarm at the current local time, with defaults from settings.
 * @param {Settings} settings
 * @param {number} now
 * @returns {AlarmDraft}
 */
export function newAlarmDraft(settings, now) {
  const d = new Date(now)
  return {
    id: '',
    hour: d.getHours(),
    minute: d.getMinutes(),
    label: '',
    days: [],
    sound: settings.defaultSound,
    volume: settings.volume,
    rampSeconds: settings.rampSeconds,
    snooze: true,
    task: settings.defaultTask,
  }
}

/** @param {Alarm} a @returns {AlarmDraft} */
export const draftOf = (a) => ({
  id: a.id,
  hour: a.hour,
  minute: a.minute,
  label: a.label,
  days: [...a.days],
  sound: a.sound,
  volume: a.volume,
  rampSeconds: a.rampSeconds,
  snooze: a.snooze,
  task: a.task,
})
