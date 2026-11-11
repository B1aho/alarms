import type { Alarm } from './alarm'

/** Week order used across the UI (Monday first). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

type Timing = Pick<Alarm, 'hour' | 'minute' | 'days'>

/** First time strictly after `after` (local time) when the alarm should ring. */
export function nextOccurrence(a: Timing, after: number): number {
  const base = new Date(after)
  for (let i = 0; i <= 8; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, a.hour, a.minute, 0, 0)
    if (d.getTime() <= after) continue
    if (a.days.length === 0 || a.days.includes(d.getDay())) return d.getTime()
  }
  throw new Error('Unreachable: an alarm always occurs within 8 days')
}

export function repeatSummary(days: readonly number[]): string {
  const set = new Set(days)
  if (set.size === 0) return 'Never'
  if (set.size === 7) return 'Every day'
  const is = (...d: number[]) => set.size === d.length && d.every((x) => set.has(x))
  if (is(1, 2, 3, 4, 5)) return 'Weekdays'
  if (is(0, 6)) return 'Weekends'
  if (set.size === 1) return `Every ${DAY_LONG[[...set][0]!]}`
  return WEEK_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_SHORT[d])
    .join(' ')
}

export type Verdict =
  | { kind: 'wait' }
  | { kind: 'ring'; source: 'schedule' | 'snooze'; trigger: number }
  | { kind: 'missed'; source: 'schedule' | 'snooze'; trigger: number }

export interface EvaluateContext {
  /** How late an alarm may still ring (e.g. the computer just woke from sleep). */
  graceMs: number
}

/** Pure decision: should this alarm ring at `now`? */
export function evaluate(a: Alarm, now: number, ctx: EvaluateContext): Verdict {
  if (a.ringingSince !== null) return { kind: 'wait' }

  if (a.snoozeUntil !== null) {
    if (now < a.snoozeUntil) return { kind: 'wait' }
    return now - a.snoozeUntil > ctx.graceMs
      ? { kind: 'missed', source: 'snooze', trigger: a.snoozeUntil }
      : { kind: 'ring', source: 'snooze', trigger: a.snoozeUntil }
  }

  if (!a.enabled || a.nextTriggerAt === null) return { kind: 'wait' }
  const trigger = a.nextTriggerAt

  if (now >= trigger) {
    return now - trigger > ctx.graceMs
      ? { kind: 'missed', source: 'schedule', trigger }
      : { kind: 'ring', source: 'schedule', trigger }
  }

  return { kind: 'wait' }
}

/** State changes after an alarm rang (or was missed) for a scheduled trigger. */
export function advanceAfterTrigger(a: Alarm, trigger: number, now: number): Pick<Alarm, 'enabled' | 'nextTriggerAt' | 'snoozeUntil'> {
  if (a.days.length === 0) return { enabled: false, nextTriggerAt: null, snoozeUntil: null }
  return { enabled: a.enabled, nextTriggerAt: nextOccurrence(a, Math.max(now, trigger)), snoozeUntil: null }
}

/** Soonest upcoming ring among enabled or snoozed alarms. */
export function nextUpcoming(alarms: readonly Alarm[]): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null
  for (const a of alarms) {
    const at = a.snoozeUntil ?? (a.enabled ? a.nextTriggerAt : null)
    if (at !== null && (!best || at < best.at)) best = { alarm: a, at }
  }
  return best
}
