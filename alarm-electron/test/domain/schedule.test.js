process.env.TZ = 'Europe/Berlin' // fixed zone with DST for the DST cases

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { advanceAfterTrigger, evaluate, nextOccurrence, nextUpcoming, repeatSummary, byTime } from '../../src/domain/schedule.js'
import { alarm, at } from './helpers.js'

const graceMs = 60 * 60_000

describe('nextOccurrence', () => {
  // 2026-11-02 is a Monday.
  it('one-shot later today', () => {
    assert.equal(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 6)), at(2026, 11, 2, 7, 30))
  })
  it('one-shot tomorrow when the time has passed', () => {
    assert.equal(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 8)), at(2026, 11, 3, 7, 30))
  })
  it('is strictly after the reference time', () => {
    assert.equal(nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 11, 2, 7, 30)), at(2026, 11, 3, 7, 30))
  })
  it('weekdays skip the weekend', () => {
    assert.equal(nextOccurrence({ hour: 7, minute: 30, days: [1, 2, 3, 4, 5] }, at(2026, 11, 6, 8)), at(2026, 11, 9, 7, 30))
  })
  it('single weekday a week later (8-day search)', () => {
    assert.equal(nextOccurrence({ hour: 7, minute: 30, days: [1] }, at(2026, 11, 2, 8)), at(2026, 11, 9, 7, 30))
  })
  it('weekends', () => {
    assert.equal(nextOccurrence({ hour: 9, minute: 0, days: [0, 6] }, at(2026, 11, 2, 8)), at(2026, 11, 7, 9, 0))
  })
  it('keeps local wall time across the spring DST change', () => {
    // Berlin: 2026-03-29 02:00 → 03:00. 07:30 the next day is only 23 h after 07:30.
    const first = nextOccurrence({ hour: 7, minute: 30, days: [] }, at(2026, 3, 28, 8))
    assert.equal(new Date(first).getHours(), 7)
    assert.equal(new Date(first).getDate(), 29)
    assert.equal(first - at(2026, 3, 28, 7, 30), 23 * 3600_000)
  })
  it('keeps local wall time across the autumn DST change', () => {
    // Berlin: 2026-10-25 03:00 → 02:00. That day has 25 hours.
    const first = nextOccurrence({ hour: 7, minute: 30, days: [0] }, at(2026, 10, 24, 8))
    assert.equal(new Date(first).getHours(), 7)
    assert.equal(first - at(2026, 10, 24, 7, 30), 25 * 3600_000)
  })
  it('a time that does not exist (spring gap) still yields a time on that day', () => {
    const t = nextOccurrence({ hour: 2, minute: 30, days: [] }, at(2026, 3, 29, 0, 0))
    assert.equal(new Date(t).getDate(), 29)
    assert.ok(t > at(2026, 3, 29, 0, 0))
  })
})

describe('repeatSummary', () => {
  /** @type {Array<[number[], string]>} */
  const cases = [
    [[], 'Never'],
    [[0, 1, 2, 3, 4, 5, 6], 'Every day'],
    [[1, 2, 3, 4, 5], 'Weekdays'],
    [[6, 0], 'Weekends'],
    [[3], 'Every Wednesday'],
    [[0], 'Every Sunday'],
    [[0, 1, 5], 'Mon Fri Sun'],
    [[1, 2, 3, 4], 'Mon Tue Wed Thu'],
  ]
  for (const [days, text] of cases) it(`${JSON.stringify(days)} → ${text}`, () => assert.equal(repeatSummary(days), text))
})

describe('evaluate (decision table §3.4)', () => {
  const trigger = at(2026, 11, 3, 7, 30)
  it('waits before the trigger', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: trigger }), trigger - 1000, graceMs).kind, 'wait')
  })
  it('rings at the trigger', () => {
    assert.deepEqual(evaluate(alarm({ nextTriggerAt: trigger }), trigger, graceMs), { kind: 'ring', source: 'schedule', trigger })
  })
  it('rings late within the grace period', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: trigger }), trigger + 30 * 60_000, graceMs).kind, 'ring')
  })
  it('rings exactly at the grace limit', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: trigger }), trigger + graceMs, graceMs).kind, 'ring')
  })
  it('is missed beyond the grace period', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: trigger }), trigger + 90 * 60_000, graceMs).kind, 'missed')
  })
  it('ignores disabled alarms', () => {
    assert.equal(evaluate(alarm({ enabled: false, nextTriggerAt: trigger }), trigger, graceMs).kind, 'wait')
  })
  it('ignores alarms without a trigger', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: null }), trigger, graceMs).kind, 'wait')
  })
  it('does not re-fire while ringing', () => {
    assert.equal(evaluate(alarm({ nextTriggerAt: trigger, ringingSince: trigger }), trigger + 5000, graceMs).kind, 'wait')
  })
  it('rings when the snooze ends, even if disabled', () => {
    const a = alarm({ enabled: false, nextTriggerAt: null, snoozeUntil: trigger })
    assert.deepEqual(evaluate(a, trigger, graceMs), { kind: 'ring', source: 'snooze', trigger })
  })
  it('waits for the snooze', () => {
    assert.equal(evaluate(alarm({ snoozeUntil: trigger }), trigger - 1, graceMs).kind, 'wait')
  })
  it('a snooze far in the past is missed', () => {
    assert.equal(evaluate(alarm({ snoozeUntil: trigger }), trigger + 2 * graceMs, graceMs).kind, 'missed')
  })
})

describe('advanceAfterTrigger', () => {
  const trigger = at(2026, 11, 3, 7, 30)
  it('turns off one-shot alarms', () => {
    assert.deepEqual(advanceAfterTrigger(alarm({ days: [] }), trigger, trigger), { enabled: false, nextTriggerAt: null })
  })
  it('schedules the next repeat day', () => {
    assert.equal(
      advanceAfterTrigger(alarm({ days: [0, 1, 2, 3, 4, 5, 6] }), trigger, trigger + 5000).nextTriggerAt,
      at(2026, 11, 4, 7, 30),
    )
  })
  it('skips days that passed while asleep', () => {
    assert.equal(
      advanceAfterTrigger(alarm({ days: [0, 1, 2, 3, 4, 5, 6] }), trigger, at(2026, 11, 5, 9)).nextTriggerAt,
      at(2026, 11, 6, 7, 30),
    )
  })
})

describe('nextUpcoming', () => {
  it('prefers the earliest of snoozes and enabled triggers', () => {
    const a = alarm({ id: 'a', nextTriggerAt: 300 })
    const b = alarm({ id: 'b', enabled: false, nextTriggerAt: null, snoozeUntil: 200 })
    const c = alarm({ id: 'c', enabled: false, nextTriggerAt: 100 })
    assert.equal(nextUpcoming([a, b, c])?.alarm.id, 'b')
  })
  it('is null when nothing is on', () => {
    assert.equal(nextUpcoming([alarm({ enabled: false, nextTriggerAt: null })]), null)
  })
})

it('sorts by time of day, then creation', () => {
  const list = [
    alarm({ id: 'x', hour: 9, createdAt: 1 }),
    alarm({ id: 'y', hour: 6, createdAt: 5 }),
    alarm({ id: 'z', hour: 6, createdAt: 2 }),
  ]
  assert.deepEqual(
    list.sort(byTime).map((a) => a.id),
    ['z', 'y', 'x'],
  )
})
