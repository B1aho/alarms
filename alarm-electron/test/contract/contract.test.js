import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COMMAND_TYPES, SYSTEM_TYPES } from '../../src/contract/commands.js'
import { EVENT_TYPES } from '../../src/contract/events.js'
import { TRANSIENT_TYPES } from '../../src/contract/transient.js'
import { ENGINE_ACCEPTS, IPC, SUBSCRIPTIONS } from '../../src/contract/channels.js'
import { checkMessage, isValidMessage } from '../../src/contract/schemas/validate.js'
import { messageSchemas } from '../../src/contract/schemas/index.js'
import { defaultSettings, initialState, initialStopwatch, initialTimer } from '../../src/domain/defaults.js'
import { project } from '../../src/domain/projections.js'

const sound = { kind: 'builtin', id: 'sunrise' }
const task = { type: 'math', difficulty: 'medium', count: 2 }
const draft = {
  id: '',
  hour: 7,
  minute: 30,
  label: 'Work',
  days: [1, 2],
  sound,
  volume: 0.9,
  rampSeconds: 60,
  snooze: true,
  task,
}
const alarm = {
  ...draft,
  id: 'abc',
  enabled: true,
  createdAt: 1,
  nextTriggerAt: 2,
  snoozeUntil: null,
  ringingSince: null,
}
const problem = { kind: 'math', prompt: '3 × 12 + 11', answer: '47' }
const meta = { v: 1, at: 1 }
const projection = project(initialState(), {
  system: { hourCycle: '24h', platform: 'darwin', version: '1.0.0', notifications: 'default' },
  soundImport: null,
  previewing: false,
  clockOffsetMs: 0,
})

/** One valid sample per message type. @type {Record<string, object>} */
const samples = {
  SaveAlarm: { alarm: draft },
  DeleteAlarm: { id: 'abc' },
  SetAlarmEnabled: { id: 'abc', enabled: false },
  CancelSnooze: { id: 'abc' },
  Snooze: { id: 'abc' },
  Stop: { id: 'abc' },
  SubmitAnswer: { id: 'abc', answer: '47' },
  UpdateSettings: { patch: { theme: 'dark', openAtLogin: false } },
  ImportSound: { requestId: 'r1', path: '/tmp/a.mp3', name: 'a.mp3', size: 10 },
  RemoveSound: { id: 'abc' },
  SetTimerDuration: { durationMs: 60_000 },
  SetTimerLabel: { label: 'Tea' },
  SetTimerSound: { sound },
  StartTimer: {},
  PauseTimer: {},
  ResumeTimer: {},
  CancelTimer: {},
  StopTimerAlert: {},
  RepeatTimer: {},
  RemoveRecent: { durationMs: 60_000 },
  StopwatchStart: {},
  StopwatchStop: {},
  StopwatchLap: {},
  StopwatchReset: {},
  WindowFocused: {},
  SystemInfo: { hourCycle: '24h', locale: 'en-US', platform: 'darwin', version: '1.0.0' },
  NotificationPermission: { state: 'granted' },
  Ping: { from: 'ui', seq: 1 },
  Pong: { from: 'engine', seq: 1 },
  TestSetClock: { now: 1 },
  AlarmSaved: { ...meta, alarm },
  AlarmDeleted: { ...meta, id: 'abc' },
  AlarmEnabledChanged: { ...meta, id: 'abc', enabled: true, nextTriggerAt: 5 },
  AlarmRang: { ...meta, id: 'abc', source: 'schedule', trigger: 1, enabled: false, nextTriggerAt: null },
  AlarmMissed: { ...meta, id: 'abc', source: 'snooze', trigger: 1, enabled: true, nextTriggerAt: 9 },
  AlarmSnoozed: { ...meta, id: 'abc', until: 9 },
  SnoozeCancelled: { ...meta, id: 'abc' },
  AlarmDismissed: { ...meta, id: 'abc' },
  TaskIssued: { ...meta, id: 'abc', round: 1, problem },
  TaskSolved: { ...meta, id: 'abc', solved: 1, problem: null },
  TaskFailed: { ...meta, id: 'abc', failures: 1, problem },
  SettingsChanged: { ...meta, settings: defaultSettings() },
  SoundImported: { ...meta, sound: { id: 'abc', name: 'Song', size: 1, addedAt: 1, ext: 'mp3' } },
  SoundRemoved: { ...meta, id: 'abc' },
  TimerChanged: { ...meta, timer: initialTimer() },
  TimerRang: { ...meta, timer: { ...initialTimer(), status: 'ringing' } },
  TimerMissed: { ...meta, timer: initialTimer() },
  RecentRemoved: { ...meta, durationMs: 60_000 },
  StopwatchChanged: { ...meta, stopwatch: initialStopwatch() },
  StateProjected: { state: projection },
  NotificationRequested: {
    tag: 'alarm-abc',
    kind: 'alarm',
    title: '⏰ Work',
    body: '07:30\nOpen the app to turn it off.',
    snooze: { alarmId: 'abc', label: 'Snooze 9 min' },
  },
  NotificationClosed: { tag: 'alarm-abc' },
  PlaySound: { key: 'alarm:abc', sound, url: null, volume: 0.9, rampSeconds: 60, loop: true },
  StopSound: { key: 'alarm:abc', fadeMs: 250 },
  PreviewPlay: { sound, url: null, volume: 0.9, rampSeconds: 0, loop: false },
  PreviewStop: {},
  ProbeSound: { probeId: 'abc', url: 'alarm-media://sounds/abc.mp3' },
  ProbeResult: { probeId: 'abc', ok: true },
  KeepAwakeChanged: { on: true },
  RingingChanged: {
    ringing: ['abc'],
    title: '⏰ Work',
    snoozeAlarmId: 'abc',
    tray: { tooltip: 'Alarm', open: 'Open Alarm', quit: 'Quit', snooze: 'Snooze 9 min' },
  },
  TimerAlertChanged: { ringing: true, title: 'Timer' },
}

describe('contract', () => {
  it('covers every message type of TZ §5.2', () => {
    const listed = [
      ...'SaveAlarm DeleteAlarm SetAlarmEnabled CancelSnooze Snooze Stop SubmitAnswer UpdateSettings ImportSound RemoveSound SetTimerDuration SetTimerLabel SetTimerSound StartTimer PauseTimer ResumeTimer CancelTimer StopTimerAlert RepeatTimer RemoveRecent StopwatchStart StopwatchStop StopwatchLap StopwatchReset'.split(
        ' ',
      ),
    ]
    assert.deepEqual(COMMAND_TYPES, listed)
    assert.deepEqual(SYSTEM_TYPES, ['WindowFocused', 'SystemInfo', 'NotificationPermission'])
    assert.deepEqual(
      EVENT_TYPES,
      'AlarmSaved AlarmDeleted AlarmEnabledChanged AlarmRang AlarmMissed AlarmSnoozed SnoozeCancelled AlarmDismissed TaskIssued TaskSolved TaskFailed SettingsChanged SoundImported SoundRemoved TimerChanged TimerRang TimerMissed RecentRemoved StopwatchChanged'.split(
        ' ',
      ),
    )
    assert.deepEqual(
      TRANSIENT_TYPES,
      'StateProjected NotificationRequested NotificationClosed PlaySound StopSound PreviewPlay PreviewStop ProbeSound ProbeResult KeepAwakeChanged RingingChanged TimerAlertChanged'.split(
        ' ',
      ),
    )
  })

  for (const schema of messageSchemas) {
    it(`${schema.$id} passes its schema`, () => {
      const sample = samples[schema.$id]
      assert.ok(sample, `no sample for ${schema.$id}`)
      const res = checkMessage({ type: schema.$id, ...sample })
      assert.deepEqual(res, { ok: true })
    })
    it(`${schema.$id} rejects extra fields`, () => {
      assert.equal(isValidMessage({ type: schema.$id, ...samples[schema.$id], extra: 1 }), false)
    })
  }

  it('drops unknown types and garbage', () => {
    assert.equal(checkMessage({ type: 'Nope' }).ok, false)
    assert.equal(checkMessage({ type: 'constructor' }).ok, false)
    assert.equal(checkMessage({ type: '__proto__' }).ok, false)
    assert.equal(checkMessage(null).ok, false)
    assert.equal(checkMessage('Ping').ok, false)
    assert.equal(checkMessage([]).ok, false)
  })

  it('rejects out-of-range values', () => {
    assert.equal(isValidMessage({ type: 'SaveAlarm', alarm: { ...draft, hour: 24 } }), false)
    assert.equal(isValidMessage({ type: 'SaveAlarm', alarm: { ...draft, label: 'x'.repeat(61) } }), false)
    assert.equal(isValidMessage({ type: 'UpdateSettings', patch: { snoozeMinutes: 31 } }), false)
    assert.equal(isValidMessage({ type: 'UpdateSettings', patch: { missedGraceMinutes: 7 } }), false)
    assert.equal(isValidMessage({ type: 'SetTimerDuration', durationMs: 999 }), false)
  })

  it('respects the receiver accept-list', () => {
    assert.equal(checkMessage({ type: 'Snooze', id: 'abc' }, ENGINE_ACCEPTS.audio).ok, false)
    assert.equal(checkMessage({ type: 'Snooze', id: 'abc' }, ENGINE_ACCEPTS.shell).ok, true)
    assert.equal(checkMessage({ type: 'TestSetClock', now: 1 }, ENGINE_ACCEPTS.ui).ok, false)
    assert.equal(checkMessage({ type: 'PlaySound', ...samples.PlaySound }, SUBSCRIPTIONS.ui).ok, false)
  })

  it('every routed type has a schema', () => {
    const all = new Set(messageSchemas.map((s) => s.$id))
    for (const list of [...Object.values(SUBSCRIPTIONS), ...Object.values(ENGINE_ACCEPTS)])
      for (const t of list) assert.ok(all.has(t), t)
  })

  it('sandboxed preloads use the channel names from channels.js', () => {
    const ui = readFileSync(new URL('../../src/preload/ui.js', import.meta.url), 'utf8')
    const audio = readFileSync(new URL('../../src/preload/audio.js', import.meta.url), 'utf8')
    for (const name of Object.values(IPC)) assert.ok(ui.includes(`'${name}'`), name)
    assert.ok(audio.includes(`'${IPC.busPort}'`))
  })

  it('generated validators are self-contained (no imports)', () => {
    const code = readFileSync(new URL('../../src/contract/schemas/validators.js', import.meta.url), 'utf8')
    assert.ok(!/^import /m.test(code))
    assert.ok(!/require\(/.test(code))
  })
})
