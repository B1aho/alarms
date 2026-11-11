import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/shared/settings'
import { newAlarm, type Alarm } from './alarm'
import { advanceAfterTrigger, evaluate, nextOccurrence, nextUpcoming, repeatSummary } from './schedule'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

function alarm(patch: Partial<Alarm> = {}): Alarm {
  return { ...newAlarm(defaultSettings(), new Date(at(2026, 11, 2, 12))), hour: 7, minute: 30, ...patch }
}

const ctx = { graceMs: 60 * 60_000 }

describe('nextOccurrence', () => {
  // 2026-11-02 is a Monday.
  it('one-shot later today', () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 6))).toBe(at(2026, 11, 2, 7, 30))
  })
  it('one-shot tomorrow when time has passed', () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 8))).toBe(at(2026, 11, 3, 7, 30))
  })
  it('is strictly after the reference time', () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 7, 30))).toBe(at(2026, 11, 3, 7, 30))
  })
  it('weekdays skip the weekend', () => {
    // Friday 2026-11-06 at 8:00 → Monday 2026-11-09
    expect(nextOccurrence({ hour: 7, minute: 30, days: [1, 2, 3, 4, 5] }, at(2026, 11, 6, 8))).toBe(at(2026, 11, 9, 7, 30))
  })
  it('single weekday a week later', () => {
    expect(nextOccurrence({ hour: 7, minute: 30, days: [1] }, at(2026, 11, 2, 8))).toBe(at(2026, 11, 9, 7, 30))
  })
})

describe('repeatSummary', () => {
  it.each([
    [[], 'Never'],
    [[0, 1, 2, 3, 4, 5, 6], 'Every day'],
    [[1, 2, 3, 4, 5], 'Weekdays'],
    [[6, 0], 'Weekends'],
    [[3], 'Every Wednesday'],
    [[0, 1, 5], 'Mon Fri Sun'],
  ])('%j → %s', (days, text) => expect(repeatSummary(days)).toBe(text))
})

describe('evaluate', () => {
  const trigger = at(2026, 11, 3, 7, 30)

  it('waits before the trigger', () => {
    expect(evaluate(alarm({ nextTriggerAt: trigger }), trigger - 1000, ctx).kind).toBe('wait')
  })
  it('rings at the trigger', () => {
    expect(evaluate(alarm({ nextTriggerAt: trigger }), trigger, ctx)).toMatchObject({ kind: 'ring' })
  })
  it('rings late within the grace period (computer woke up)', () => {
    expect(evaluate(alarm({ nextTriggerAt: trigger }), trigger + 30 * 60_000, ctx).kind).toBe('ring')
  })
  it('reports missed beyond the grace period', () => {
    expect(evaluate(alarm({ nextTriggerAt: trigger }), trigger + 90 * 60_000, ctx).kind).toBe('missed')
  })
  it('ignores disabled alarms', () => {
    expect(evaluate(alarm({ enabled: false, nextTriggerAt: trigger }), trigger, ctx).kind).toBe('wait')
  })
  it('does not re-fire while ringing', () => {
    expect(evaluate(alarm({ nextTriggerAt: trigger, ringingSince: trigger }), trigger + 5000, ctx).kind).toBe('wait')
  })
  it('rings when snooze ends', () => {
    const a = alarm({ enabled: false, nextTriggerAt: null, snoozeUntil: trigger })
    expect(evaluate(a, trigger, ctx)).toMatchObject({ kind: 'ring', source: 'snooze' })
  })

})

describe('advanceAfterTrigger', () => {
  const trigger = at(2026, 11, 3, 7, 30)
  it('turns off one-shot alarms', () => {
    expect(advanceAfterTrigger(alarm({ days: [] }), trigger, trigger)).toEqual({ enabled: false, nextTriggerAt: null, snoozeUntil: null })
  })
  it('schedules the next repeat', () => {
    expect(advanceAfterTrigger(alarm({ days: [0, 1, 2, 3, 4, 5, 6] }), trigger, trigger + 5000).nextTriggerAt).toBe(at(2026, 11, 4, 7, 30))
  })
})

describe('nextUpcoming', () => {
  it('prefers the earliest of snoozes and enabled triggers', () => {
    const a = alarm({ id: 'a', nextTriggerAt: 300 })
    const b = alarm({ id: 'b', enabled: false, nextTriggerAt: null, snoozeUntil: 200 })
    const c = alarm({ id: 'c', enabled: false, nextTriggerAt: 100 })
    expect(nextUpcoming([a, b, c])?.alarm.id).toBe('b')
  })
})
