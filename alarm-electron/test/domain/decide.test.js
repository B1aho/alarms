import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decide, decideTick, importError, soundNameFromFile } from '../../src/domain/decide.js'
import { evolve, evolveAll } from '../../src/domain/evolve.js'
import { keepAwake, notificationsFor, project, ringingInfo, soundPlan, timerAlert } from '../../src/domain/projections.js'
import { repairSettings, upcast } from '../../src/domain/upcast.js'
import { defaultSettings, initialState } from '../../src/domain/defaults.js'
import { newAlarmDraft } from '../../src/domain/schedule.js'
import { seededRng } from '../../src/domain/tasks.js'
import { alarm, at, state } from './helpers.js'

const rng = seededRng(1)
const now = at(2026, 11, 3, 7, 30)

/**
 * Runs commands through decide + evolve.
 * @param {import('../../src/domain/defaults.js').State} s
 * @param {Array<any>} cmds
 * @param {number} t
 */
function run(s, cmds, t = now) {
  /** @type {import('../../src/contract/events.js').JournalEvent[]} */
  const all = []
  for (const c of cmds) {
    const evs = decide(s, c, t, rng)
    all.push(...evs)
    s = evolveAll(s, evs)
  }
  return { s, events: all }
}

describe('SaveAlarm', () => {
  it('creates an enabled alarm with an id, createdAt and next trigger', () => {
    const draft = { ...newAlarmDraft(defaultSettings(), at(2026, 11, 3, 6)), hour: 7, minute: 45, label: 'Work', days: [5, 1, 1] }
    const { s, events } = run(initialState(), [{ type: 'SaveAlarm', alarm: draft }], at(2026, 11, 3, 6))
    assert.equal(events[0].type, 'AlarmSaved')
    const a = s.alarms[0]
    assert.ok(a.id.length > 0)
    assert.equal(a.enabled, true)
    assert.deepEqual(a.days, [1, 5])
    assert.equal(a.createdAt, at(2026, 11, 3, 6))
    assert.equal(a.nextTriggerAt, at(2026, 11, 6, 7, 45)) // Friday
    assert.equal(a.snoozeUntil, null)
  })
  it('saving always re-enables and clears snooze and ringing', () => {
    const a = alarm({ enabled: false, snoozeUntil: now + 1, ringingSince: now - 1, createdAt: 5 })
    const { s } = run(
      state({ alarms: [a] }),
      [{ type: 'SaveAlarm', alarm: { ...a, label: 'X' } }].map((c) => ({ ...c, alarm: strip(c.alarm) })),
    )
    assert.equal(s.alarms[0].enabled, true)
    assert.equal(s.alarms[0].ringingSince, null)
    assert.equal(s.alarms[0].snoozeUntil, null)
    assert.equal(s.alarms[0].createdAt, 5)
    assert.equal(s.alarms[0].label, 'X')
  })
})

/** @param {any} a */
function strip(a) {
  const { enabled: _e, createdAt: _c, nextTriggerAt: _n, snoozeUntil: _s, ringingSince: _r, ...draft } = a
  return draft
}

describe('toggle and snooze cancel (§3.2)', () => {
  it('enabling reschedules from now and clears the snooze', () => {
    const a = alarm({ enabled: false, nextTriggerAt: null, snoozeUntil: now + 60_000 })
    const { s } = run(state({ alarms: [a] }), [{ type: 'SetAlarmEnabled', id: a.id, enabled: true }], at(2026, 11, 3, 8))
    assert.equal(s.alarms[0].nextTriggerAt, at(2026, 11, 4, 7, 30))
    assert.equal(s.alarms[0].snoozeUntil, null)
  })
  it('disabling clears the trigger and the snooze', () => {
    const a = alarm({ snoozeUntil: now + 60_000 })
    const { s } = run(state({ alarms: [a] }), [{ type: 'SetAlarmEnabled', id: a.id, enabled: false }])
    assert.equal(s.alarms[0].nextTriggerAt, null)
    assert.equal(s.alarms[0].snoozeUntil, null)
  })
  it('CancelSnooze only when snoozed', () => {
    const a = alarm({ snoozeUntil: now + 60_000 })
    assert.equal(decide(state({ alarms: [a] }), { type: 'CancelSnooze', id: a.id }, now, rng)[0].type, 'SnoozeCancelled')
    assert.deepEqual(decide(state({ alarms: [alarm()] }), { type: 'CancelSnooze', id: 'a1' }, now, rng), [])
  })
})

describe('tick: ring, miss, exactly once', () => {
  it('one-shot alarm rings once and turns off', () => {
    const a = alarm({ nextTriggerAt: now })
    let s = state({ alarms: [a] })
    const first = decideTick(s, now)
    assert.deepEqual(
      first.map((e) => e.type),
      ['AlarmRang'],
    )
    s = evolveAll(s, first)
    assert.equal(s.alarms[0].ringingSince, now)
    assert.equal(s.alarms[0].enabled, false)
    assert.equal(s.alarms[0].nextTriggerAt, null)
    // further ticks never ring again
    for (let i = 1; i < 10; i++) assert.deepEqual(decideTick(s, now + i * 500), [])
  })
  it('repeating alarm moves to the next day', () => {
    const a = alarm({ days: [1, 2, 3, 4, 5], nextTriggerAt: now })
    const s = evolveAll(state({ alarms: [a] }), decideTick(state({ alarms: [a] }), now))
    assert.equal(s.alarms[0].enabled, true)
    assert.equal(s.alarms[0].nextTriggerAt, at(2026, 11, 4, 7, 30))
  })
  it('missed beyond grace: no ringing, schedule moved, notification if < 12 h', () => {
    const a = alarm({ days: [0, 1, 2, 3, 4, 5, 6], nextTriggerAt: now })
    const late = now + 2 * 3600_000
    const evs = decideTick(state({ alarms: [a] }), late)
    assert.deepEqual(
      evs.map((e) => e.type),
      ['AlarmMissed'],
    )
    const before = state({ alarms: [a] })
    const after = evolveAll(before, evs)
    assert.equal(after.alarms[0].ringingSince, null)
    assert.equal(after.alarms[0].nextTriggerAt, at(2026, 11, 4, 7, 30))
    const notes = notificationsFor(evs, before, after, '24h')
    assert.equal(notes.length, 1)
    assert.equal(notes[0].type === 'NotificationRequested' && notes[0].title, 'Missed alarm: Alarm')
    assert.equal(
      notes[0].type === 'NotificationRequested' && notes[0].body,
      'It was set for 07:30, while the computer was asleep or the app was closed.',
    )
  })
  it('missed more than 12 h ago: silent', () => {
    const a = alarm({ nextTriggerAt: now })
    const evs = decideTick(state({ alarms: [a] }), now + 13 * 3600_000)
    assert.equal(evs[0].type, 'AlarmMissed')
    assert.deepEqual(notificationsFor(evs, state({ alarms: [a] }), evolveAll(state({ alarms: [a] }), evs), '24h'), [])
  })
  it('snoozed one-shot rings again although disabled', () => {
    const a = alarm({ enabled: false, nextTriggerAt: null, snoozeUntil: now })
    const evs = decideTick(state({ alarms: [a] }), now)
    assert.equal(evs[0].type, 'AlarmRang')
    const s = evolveAll(state({ alarms: [a] }), evs)
    assert.equal(s.alarms[0].snoozeUntil, null)
    assert.equal(s.alarms[0].ringingSince, now)
  })
  it('repairs an enabled alarm without a trigger', () => {
    const a = alarm({ nextTriggerAt: null })
    assert.equal(decideTick(state({ alarms: [a] }), now)[0].type, 'AlarmEnabledChanged')
  })
})

describe('ringing: snooze, stop, tasks (§3.5, §3.7)', () => {
  const ringing = () => state({ alarms: [alarm({ ringingSince: now, enabled: false, nextTriggerAt: null })] })
  it('Snooze sets snoozeUntil = now + snoozeMinutes and stops ringing', () => {
    const { s, events } = run(ringing(), [{ type: 'Snooze', id: 'a1' }])
    assert.equal(events[0].type, 'AlarmSnoozed')
    assert.equal(s.alarms[0].snoozeUntil, now + 9 * 60_000)
    assert.equal(s.alarms[0].ringingSince, null)
  })
  it('Snooze is repeatable', () => {
    let { s } = run(ringing(), [{ type: 'Snooze', id: 'a1' }])
    s = evolveAll(s, decideTick(s, now + 9 * 60_000))
    assert.equal(s.alarms[0].ringingSince, now + 9 * 60_000)
    const r = run(s, [{ type: 'Snooze', id: 'a1' }], now + 10 * 60_000)
    assert.equal(r.s.alarms[0].snoozeUntil, now + 19 * 60_000)
  })
  it('Snooze is refused when the alarm has snooze off', () => {
    const s = state({ alarms: [alarm({ ringingSince: now, snooze: false })] })
    assert.deepEqual(decide(s, { type: 'Snooze', id: 'a1' }, now, rng), [])
  })
  it('Stop without task dismisses at once', () => {
    const s = state({ alarms: [alarm({ ringingSince: now, task: { type: 'none', difficulty: 'easy', count: 1 } })] })
    const r = run(s, [{ type: 'Stop', id: 'a1' }])
    assert.deepEqual(
      r.events.map((e) => e.type),
      ['AlarmDismissed'],
    )
    assert.equal(r.s.alarms[0].ringingSince, null)
  })
  it('Stop with a task issues it; wrong answer → new problem, progress kept; 2 right → dismissed', () => {
    let { s, events } = run(ringing(), [{ type: 'Stop', id: 'a1' }])
    assert.equal(events[0].type, 'TaskIssued')
    const answer = () => s.tasks.a1.problem.answer
    ;({ s } = run(s, [{ type: 'SubmitAnswer', id: 'a1', answer: answer() }]))
    assert.equal(s.tasks.a1.solved, 1)
    const before = s.tasks.a1.problem
    ;({ s, events } = run(s, [{ type: 'SubmitAnswer', id: 'a1', answer: 'nope' }]))
    assert.equal(events[0].type, 'TaskFailed')
    assert.equal(s.tasks.a1.solved, 1)
    assert.equal(s.tasks.a1.failures, 1)
    assert.notDeepEqual(s.tasks.a1.problem, before)
    ;({ s, events } = run(s, [{ type: 'SubmitAnswer', id: 'a1', answer: answer() }]))
    assert.deepEqual(
      events.map((e) => e.type),
      ['TaskSolved', 'AlarmDismissed'],
    )
    assert.equal(s.alarms[0].ringingSince, null)
    assert.equal(s.tasks.a1, undefined)
  })
  it('projection hides answers', () => {
    const { s } = run(ringing(), [{ type: 'Stop', id: 'a1' }])
    const p = project(s, {
      system: { hourCycle: '24h', platform: 'darwin', version: '1.0.0', notifications: 'granted' },
      soundImport: null,
      previewing: false,
      clockOffsetMs: 0,
    })
    assert.deepEqual(Object.keys(p.tasks.a1).sort(), ['failures', 'kind', 'prompt', 'round', 'solved', 'total'])
  })
})

describe('timer (§3.10)', () => {
  it('start, pause, resume, cancel', () => {
    let { s } = run(initialState(), [{ type: 'StartTimer' }])
    assert.equal(s.timer.status, 'running')
    assert.equal(s.timer.endsAt, now + 5 * 60_000)
    ;({ s } = run(s, [{ type: 'PauseTimer' }], now + 60_000))
    assert.equal(s.timer.status, 'paused')
    assert.equal(s.timer.remainingMs, 4 * 60_000)
    ;({ s } = run(s, [{ type: 'ResumeTimer' }], now + 120_000))
    assert.equal(s.timer.endsAt, now + 120_000 + 4 * 60_000)
    ;({ s } = run(s, [{ type: 'CancelTimer' }]))
    assert.equal(s.timer.status, 'idle')
  })
  it('recents: newest first, no duplicates by duration, max 6', () => {
    let s = initialState()
    for (const d of [1, 2, 3, 4, 5, 6, 7, 3].map((m) => m * 60_000))
      s = run(s, [{ type: 'StartTimer', durationMs: d, label: '' }]).s
    assert.deepEqual(
      s.timer.recents.map((r) => r.durationMs / 60_000),
      [3, 7, 6, 5, 4, 2],
    )
  })
  it('rings at the end; stop and repeat', () => {
    let { s } = run(initialState(), [{ type: 'StartTimer', durationMs: 10_000 }])
    const evs = decideTick(s, now + 10_000)
    assert.equal(evs[0].type, 'TimerRang')
    s = evolveAll(s, evs)
    assert.equal(s.timer.status, 'ringing')
    assert.deepEqual(timerAlert(s), { ringing: true, title: 'Timer' })
    assert.deepEqual([...soundPlan(s).keys()], ['timer'])
    const notes = notificationsFor(evs, initialState(), s, '24h')
    assert.equal(notes[0].type === 'NotificationRequested' && notes[0].title, '⏱ Timer')
    assert.equal(notes[0].type === 'NotificationRequested' && notes[0].body, '00:10 timer is done.')
    const r = run(s, [{ type: 'RepeatTimer' }], now + 20_000)
    assert.equal(r.s.timer.status, 'running')
    assert.equal(r.s.timer.endsAt, now + 30_000)
    const st = run(s, [{ type: 'StopTimerAlert' }])
    assert.equal(st.s.timer.status, 'idle')
  })
  it('ended more than 10 min ago: only a notification', () => {
    const { s } = run(initialState(), [{ type: 'StartTimer', durationMs: 60_000, label: 'Tea' }])
    const evs = decideTick(s, now + 60_000 + 11 * 60_000)
    assert.equal(evs[0].type, 'TimerMissed')
    const after = evolveAll(s, evs)
    assert.equal(after.timer.status, 'idle')
    const n = notificationsFor(evs, s, after, '24h')[0]
    assert.equal(n.type === 'NotificationRequested' && n.title, 'Tea ended')
    assert.equal(n.type === 'NotificationRequested' && n.body, 'Your 01:00 timer finished while the computer was asleep.')
  })
  it('duration has a 1 s minimum', () => {
    const { s } = run(initialState(), [{ type: 'SetTimerDuration', durationMs: 1000 }])
    assert.equal(s.timer.durationMs, 1000)
  })
})

describe('stopwatch (§3.11)', () => {
  it('start, lap, stop, reset', () => {
    let { s } = run(initialState(), [{ type: 'StopwatchStart' }])
    ;({ s } = run(s, [{ type: 'StopwatchLap' }], now + 1000))
    ;({ s } = run(s, [{ type: 'StopwatchStop' }], now + 2500))
    assert.deepEqual(s.stopwatch, { startedAt: null, accumulatedMs: 2500, laps: [1000] })
    ;({ s } = run(s, [{ type: 'StopwatchStart' }], now + 10_000))
    ;({ s } = run(s, [{ type: 'StopwatchLap' }], now + 10_500))
    assert.deepEqual(s.stopwatch.laps, [1000, 3000])
    ;({ s } = run(s, [{ type: 'StopwatchReset' }]))
    assert.deepEqual(s.stopwatch, { startedAt: null, accumulatedMs: 0, laps: [] })
  })
})

describe('settings and sounds', () => {
  it('UpdateSettings merges and is a no-op when unchanged', () => {
    const { s, events } = run(initialState(), [{ type: 'UpdateSettings', patch: { snoozeMinutes: 5 } }])
    assert.equal(events.length, 1)
    assert.equal(s.settings.snoozeMinutes, 5)
    assert.equal(s.settings.openAtLogin, true)
    assert.deepEqual(decide(s, { type: 'UpdateSettings', patch: { snoozeMinutes: 5 } }, now, rng), [])
  })
  it('import validation', () => {
    assert.equal(importError('song.mp3', 1000), null)
    assert.equal(importError('song.FLAC', 1000), null)
    assert.equal(importError('notes.txt', 10), 'That file is not an audio file.')
    assert.equal(importError('big.wav', 81 * 1024 * 1024), 'That file is larger than 80 MB.')
    assert.equal(soundNameFromFile('/x/y/My Song.final.mp3'), 'My Song.final')
  })
  it('custom sounds sorted by name; a removed sound falls back to Sunrise', () => {
    let { s } = run(initialState(), [
      { type: 'AddSound', sound: { id: 'b', name: 'Zed', size: 1, addedAt: 1, ext: 'mp3' } },
      { type: 'AddSound', sound: { id: 'c', name: 'Alpha', size: 1, addedAt: 1, ext: 'wav' } },
    ])
    assert.deepEqual(
      s.sounds.map((x) => x.name),
      ['Alpha', 'Zed'],
    )
    s = { ...s, alarms: [alarm({ ringingSince: now, sound: { kind: 'custom', id: 'b' } })] }
    assert.equal(soundPlan(s).get('alarm:a1')?.url, 'alarm-media://sounds/b.mp3')
    ;({ s } = run(s, [{ type: 'RemoveSound', id: 'b' }]))
    assert.deepEqual(soundPlan(s).get('alarm:a1')?.sound, { kind: 'builtin', id: 'sunrise' })
  })
})

describe('projections', () => {
  it('keep-awake only with the setting and an active alarm', () => {
    const s = state({ alarms: [alarm()] })
    assert.equal(keepAwake(s), false)
    assert.equal(keepAwake({ ...s, settings: { ...s.settings, keepAwake: true } }), true)
    assert.equal(keepAwake({ ...s, settings: { ...s.settings, keepAwake: true }, alarms: [alarm({ enabled: false })] }), false)
  })
  it('ringing info for tray and title', () => {
    const s = state({ alarms: [alarm({ label: 'Gym', ringingSince: now })] })
    assert.deepEqual(ringingInfo(s), {
      ringing: ['a1'],
      title: '⏰ Gym',
      snoozeAlarmId: 'a1',
      tray: { tooltip: 'Alarm', open: 'Open Alarm', quit: 'Quit', snooze: 'Snooze 9 min' },
    })
    const noSnooze = state({ alarms: [alarm({ ringingSince: now, snooze: false })] })
    assert.equal(ringingInfo(noSnooze).tray.snooze, null)
  })
  it('alarm notification text and snooze action', () => {
    const before = state({ alarms: [alarm({ label: 'Work', nextTriggerAt: now })] })
    const evs = decideTick(before, now)
    const n = notificationsFor(evs, before, evolveAll(before, evs), '12h')[0]
    assert.deepEqual(n, {
      type: 'NotificationRequested',
      tag: 'alarm-a1',
      kind: 'alarm',
      title: '⏰ Work',
      body: '7:30 AM\nOpen the app to turn it off.',
      snooze: { alarmId: 'a1', label: 'Snooze 9 min' },
    })
  })
  it('evolve is idempotent per event', () => {
    const before = state({ alarms: [alarm({ nextTriggerAt: now })] })
    const evs = decideTick(before, now)
    const once = evolveAll(before, evs)
    assert.deepEqual(evolveAll(once, evs), once)
    assert.deepEqual(evolve(once, evs[0]), once)
  })
})

describe('upcast', () => {
  it('v0 events (no version) are brought to v1', () => {
    const e = upcast({ type: 'SettingsChanged', at: 1, settings: { theme: 'dark' } })
    assert.equal(e?.v, 1)
    assert.equal(e?.type === 'SettingsChanged' && e.settings.theme, 'dark')
    assert.equal(e?.type === 'SettingsChanged' && e.settings.openAtLogin, true)
  })
  it('broken setting fields fall back to defaults', () => {
    const r = repairSettings({ theme: 'purple', snoozeMinutes: 99, volume: 0.5 })
    assert.equal(r.theme, 'system')
    assert.equal(r.snoozeMinutes, 9)
    assert.equal(r.volume, 0.5)
  })
  it('rejects garbage and future versions', () => {
    assert.equal(upcast(null), null)
    assert.equal(upcast([1]), null)
    assert.equal(upcast({ type: 'AlarmDeleted', v: 99, at: 1, id: 'x' }), null)
    assert.equal(upcast({ v: 1, at: 1 }), null)
  })
  it('v0 AlarmSaved gets missing optional fields', () => {
    const e = upcast({ type: 'AlarmSaved', at: 1, alarm: { id: 'x' } })
    assert.equal(e?.type === 'AlarmSaved' && e.alarm.ringingSince, null)
  })
})
