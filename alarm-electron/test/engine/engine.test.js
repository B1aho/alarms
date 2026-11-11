import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEngine } from '../../src/engine/engine.js'
import { openJournal } from '../../src/engine/journal.js'
import { seededRng } from '../../src/domain/tasks.js'
import { defaultSettings } from '../../src/domain/defaults.js'

const T0 = new Date(2026, 10, 3, 7, 29, 0).getTime() // Tue 07:29 local

/** @type {string} */
let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alarm-engine-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Fake clock fixed at `t` until moved. */
function fakeClock(t = T0) {
  let now = t
  return {
    now: () => now,
    /** @param {number} x */
    set(x) {
      now = x
    },
    offsetMs: () => now - Date.now(),
    /** @param {number} ms */
    advance(ms) {
      now += ms
    },
  }
}

/** @param {{ clock?: ReturnType<typeof fakeClock>, testMode?: boolean }} [o] */
function boot(o = {}) {
  const clock = o.clock ?? fakeClock()
  /** @type {string[]} */
  const logs = []
  const engine = createEngine({ dataDir: dir, clock, rng: seededRng(7), testMode: o.testMode, log: (m) => logs.push(m) })
  /** @type {Record<string, any[]>} */
  const inbox = { ui: [], audio: [], shell: [] }
  const ids = {
    ui: engine.connect('ui', (m) => inbox.ui.push(m)),
    audio: engine.connect('audio', (m) => inbox.audio.push(m)),
    shell: engine.connect('shell', (m) => inbox.shell.push(m)),
  }
  /** @param {'ui' | 'audio' | 'shell'} role @param {any} msg */
  const send = (role, msg) => engine.receive(ids[role], msg)
  const of = (/** @type {string} */ role, /** @type {string} */ type) => inbox[role].filter((m) => m.type === type)
  const lastProjection = () => of('ui', 'StateProjected').at(-1).state
  return { engine, clock, inbox, send, of, lastProjection, logs, ids }
}

const draft = (/** @type {Partial<any>} */ patch = {}) => ({
  id: '',
  hour: 7,
  minute: 30,
  label: 'Work',
  days: [],
  sound: { kind: 'builtin', id: 'sunrise' },
  volume: 0.9,
  rampSeconds: 60,
  snooze: true,
  task: { type: 'none', difficulty: 'easy', count: 1 },
  ...patch,
})

describe('engine chains: commands in → state and messages out', () => {
  it('SaveAlarm → AlarmSaved in the journal → projection to ui and shell', () => {
    const { send, lastProjection, of, engine } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    const p = lastProjection()
    assert.equal(p.alarms.length, 1)
    assert.equal(p.alarms[0].nextTriggerAt, new Date(2026, 10, 3, 7, 30).getTime())
    assert.ok(of('shell', 'StateProjected').length >= 1)
    engine.close()
    const lines = fs.readFileSync(path.join(dir, 'journal.jsonl'), 'utf8').trim().split('\n')
    assert.equal(JSON.parse(lines[0]).type, 'AlarmSaved')
    assert.equal(JSON.parse(lines[0]).v, 1)
  })

  it('rings exactly once: one AlarmRang, PlaySound, notification, RingingChanged', () => {
    const { send, clock, engine, of } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    clock.advance(60_000) // 07:30
    for (let i = 0; i < 20; i++) {
      engine.tick()
      clock.advance(500)
    }
    engine.close()
    const rang = fs
      .readFileSync(path.join(dir, 'journal.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter((l) => JSON.parse(l).type === 'AlarmRang')
    assert.equal(rang.length, 1)
    assert.equal(of('audio', 'PlaySound').length, 1)
    assert.equal(of('audio', 'PlaySound')[0].key.startsWith('alarm:'), true)
    const notes = of('shell', 'NotificationRequested')
    assert.equal(notes.length, 1)
    assert.equal(notes[0].title, '⏰ Work')
    assert.equal(notes[0].body, '07:30\nOpen the app to turn it off.')
    assert.deepEqual(notes[0].snooze, { alarmId: engine.state().alarms[0].id, label: 'Snooze 9 min' })
    const ringing = of('shell', 'RingingChanged').at(-1)
    assert.equal(ringing.title, '⏰ Work')
    assert.equal(ringing.tray.snooze, 'Snooze 9 min')
  })

  it('Snooze from the shell (notification/tray) stops the sound and closes the notification', () => {
    const { send, clock, engine, of } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    clock.advance(60_000)
    engine.tick()
    const id = engine.state().alarms[0].id
    send('shell', { type: 'Snooze', id })
    assert.deepEqual(of('audio', 'StopSound').at(-1), { type: 'StopSound', key: `alarm:${id}`, fadeMs: 250 })
    assert.equal(of('shell', 'NotificationClosed').at(-1).tag, `alarm-${id}`)
    assert.equal(engine.state().alarms[0].snoozeUntil, clock.now() + 9 * 60_000)
    assert.equal(of('shell', 'RingingChanged').at(-1).tray.snooze, null)
  })

  it('task flow through the engine: Stop → task → wrong → right ×2 → dismissed', () => {
    const { send, clock, engine, lastProjection } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft({ task: { type: 'math', difficulty: 'easy', count: 2 } }) })
    clock.advance(60_000)
    engine.tick()
    const id = engine.state().alarms[0].id
    send('ui', { type: 'Stop', id })
    assert.equal(lastProjection().tasks[id].solved, 0)
    assert.equal(lastProjection().tasks[id].answer, undefined)
    send('ui', { type: 'SubmitAnswer', id, answer: 'wrong' })
    assert.equal(lastProjection().tasks[id].failures, 1)
    for (let i = 0; i < 2; i++) send('ui', { type: 'SubmitAnswer', id, answer: engine.state().tasks[id].problem.answer })
    assert.equal(engine.state().alarms[0].ringingSince, null)
    assert.deepEqual(lastProjection().tasks, {})
  })

  it('invalid and unknown messages are dropped and logged', () => {
    const { send, logs, engine } = boot()
    send('ui', { type: 'SaveAlarm', alarm: { ...draft(), hour: 99 } })
    send('ui', { type: 'Bogus' })
    send('audio', { type: 'SaveAlarm', alarm: draft() }) // audio may not send commands
    send('ui', { type: 'TestSetClock', now: 1 }) // not accepted from ui
    assert.equal(engine.state().alarms.length, 0)
    assert.equal(logs.filter((l) => l.includes('dropped')).length, 4)
  })

  it('TestSetClock is ignored outside test mode', () => {
    const { send, clock, logs } = boot()
    const before = clock.now()
    send('shell', { type: 'TestSetClock', now: before + 3_600_000 })
    assert.ok(Math.abs(clock.now() - before) < 1000)
    assert.ok(logs.some((l) => l.includes('ignored')))
  })

  it('a new audio process gets PlaySound for every ringing alarm', () => {
    const { send, clock, engine } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    clock.advance(60_000)
    engine.tick()
    /** @type {any[]} */
    const fresh = []
    engine.connect('audio', (m) => fresh.push(m))
    assert.equal(fresh.filter((m) => m.type === 'PlaySound').length, 1)
  })

  it('timer: start → rings → StopTimerAlert; TimerAlertChanged to shell', () => {
    const { send, clock, engine, of } = boot()
    send('ui', { type: 'StartTimer', durationMs: 5000 })
    clock.advance(5000)
    engine.tick()
    assert.equal(engine.state().timer.status, 'ringing')
    assert.equal(of('audio', 'PlaySound').at(-1).key, 'timer')
    assert.equal(of('audio', 'PlaySound').at(-1).volume, 0.9)
    assert.equal(of('audio', 'PlaySound').at(-1).rampSeconds, 3)
    assert.deepEqual(of('shell', 'TimerAlertChanged').at(-1), { type: 'TimerAlertChanged', ringing: true, title: 'Timer' })
    send('ui', { type: 'StopTimerAlert' })
    assert.equal(of('audio', 'StopSound').at(-1).key, 'timer')
    assert.equal(of('shell', 'NotificationClosed').at(-1).tag, 'timer')
  })

  it('keep-awake follows the setting and active alarms', () => {
    const { send, of } = boot()
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    send('ui', { type: 'UpdateSettings', patch: { keepAwake: true } })
    assert.equal(of('shell', 'KeepAwakeChanged').at(-1).on, true)
    send('ui', { type: 'UpdateSettings', patch: { keepAwake: false } })
    assert.equal(of('shell', 'KeepAwakeChanged').at(-1).on, false)
  })

  it('preview is relayed to audio with a resolved URL', () => {
    const { send, of } = boot()
    send('ui', {
      type: 'PreviewPlay',
      sound: { kind: 'builtin', id: 'harp' },
      url: null,
      volume: 0.5,
      rampSeconds: 0,
      loop: false,
    })
    assert.equal(of('audio', 'PreviewPlay').length, 1)
    send('ui', { type: 'PreviewStop' })
    assert.equal(of('audio', 'PreviewStop').length, 1)
  })

  it('Ping → Pong to the sender only', () => {
    const { send, of } = boot()
    send('audio', { type: 'Ping', from: 'audio', seq: 3 })
    assert.deepEqual(of('audio', 'Pong'), [{ type: 'Pong', from: 'engine', seq: 3 }])
    assert.equal(of('ui', 'Pong').length, 0)
  })
})

describe('music import', () => {
  it('rejects non-audio and oversized files before copying', async () => {
    const { send, lastProjection } = boot()
    const txt = path.join(dir, 'notes.txt')
    fs.writeFileSync(txt, 'hello')
    send('ui', { type: 'ImportSound', requestId: 'r1', path: txt, name: 'notes.txt', size: 5 })
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(lastProjection().soundImport, {
      requestId: 'r1',
      status: 'error',
      error: 'That file is not an audio file.',
      soundId: null,
    })
    const big = path.join(dir, 'big.wav')
    fs.writeFileSync(big, '')
    fs.truncateSync(big, 81 * 1024 * 1024)
    send('ui', { type: 'ImportSound', requestId: 'r2', path: big, name: 'big.wav', size: 0 })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(lastProjection().soundImport.error, 'That file is larger than 80 MB.')
  })

  it('copies, probes in audio, records; a failed probe deletes the copy', async () => {
    const { send, of, lastProjection, engine } = boot()
    const src = path.join(dir, 'My Song.mp3')
    fs.writeFileSync(src, 'not really mp3')
    send('ui', { type: 'ImportSound', requestId: 'r1', path: src, name: 'My Song.mp3', size: 14 })
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(lastProjection().soundImport.status, 'adding')
    const probe = of('audio', 'ProbeSound')[0]
    assert.match(probe.url, /^alarm-media:\/\/sounds\/[a-z0-9]+\.mp3$/)
    send('audio', { type: 'ProbeResult', probeId: probe.probeId, ok: true })
    await new Promise((r) => setTimeout(r, 20))
    const p = lastProjection()
    assert.equal(p.soundImport.status, 'done')
    assert.equal(p.sounds[0].name, 'My Song')
    assert.ok(fs.existsSync(path.join(dir, 'sounds', `${p.sounds[0].id}.mp3`)))
    // removal deletes the stored copy
    send('ui', { type: 'RemoveSound', id: p.sounds[0].id })
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(fs.readdirSync(path.join(dir, 'sounds')).length, 0)
    // failed probe
    send('ui', { type: 'ImportSound', requestId: 'r3', path: src, name: 'My Song.mp3', size: 14 })
    await new Promise((r) => setTimeout(r, 50))
    send('audio', { type: 'ProbeResult', probeId: of('audio', 'ProbeSound').at(-1).probeId, ok: false })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(lastProjection().soundImport.error, 'This audio format cannot be played on this computer.')
    assert.equal(fs.readdirSync(path.join(dir, 'sounds')).length, 0)
    assert.equal(engine.state().sounds.length, 0)
  })
})

describe('recovery from the journal', () => {
  it('state survives a restart; a ringing alarm keeps ringing (ringingSince)', () => {
    const clock = fakeClock()
    const a = boot({ clock })
    a.send('ui', { type: 'SaveAlarm', alarm: draft() })
    a.send('ui', { type: 'UpdateSettings', patch: { theme: 'dark' } })
    a.send('ui', { type: 'StopwatchStart' })
    clock.advance(60_000)
    a.engine.tick()
    a.engine.close()

    const b = boot({ clock })
    const s = b.engine.state()
    assert.equal(s.settings.theme, 'dark')
    assert.notEqual(s.alarms[0].ringingSince, null)
    assert.notEqual(s.stopwatch.startedAt, null)
    assert.equal(b.of('audio', 'PlaySound').length, 1) // audio gets the ringing sound again
    assert.equal(b.of('shell', 'NotificationRequested').length, 1) // notification re-posted
    // and it does not ring a second time
    b.engine.tick()
    b.engine.close()
    const rang = fs
      .readFileSync(path.join(dir, 'journal.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('"AlarmRang"'))
    assert.equal(rang.length, 1)
  })

  it('broken lines are skipped and the rest loads', () => {
    const settings = { ...defaultSettings(), theme: 'light' }
    const lines = [
      JSON.stringify({ type: 'SettingsChanged', v: 1, at: 1, settings }),
      '{ this is not json',
      JSON.stringify({ type: 'AlarmSaved', v: 1, at: 2, alarm: { id: 'x', hour: 99 } }), // fails schema
      JSON.stringify({ type: 'Mystery', v: 1, at: 3 }),
      JSON.stringify({ type: 'StopwatchChanged', v: 1, at: 4, stopwatch: { startedAt: null, accumulatedMs: 1234, laps: [] } }),
      '',
    ]
    fs.writeFileSync(path.join(dir, 'journal.jsonl'), lines.join('\n'))
    const { engine, logs } = boot()
    assert.equal(engine.state().settings.theme, 'light')
    assert.equal(engine.state().stopwatch.accumulatedMs, 1234)
    assert.equal(engine.state().alarms.length, 0)
    assert.deepEqual(engine.journalStats, { applied: 2, skipped: 3 })
    assert.ok(logs.some((l) => l.includes('skipped 3')))
  })

  it('a broken setting field falls back to its default (record kept)', () => {
    fs.writeFileSync(
      path.join(dir, 'journal.jsonl'),
      JSON.stringify({
        type: 'SettingsChanged',
        v: 1,
        at: 1,
        settings: { ...defaultSettings(), theme: 'dark', snoozeMinutes: 500 },
      }) + '\n',
    )
    const { engine } = boot()
    assert.equal(engine.state().settings.theme, 'dark')
    assert.equal(engine.state().settings.snoozeMinutes, 9)
  })

  it('upcasts v0 events written before versioning', () => {
    fs.writeFileSync(
      path.join(dir, 'journal.jsonl'),
      JSON.stringify({ type: 'SettingsChanged', at: 1, settings: { theme: 'dark' } }) + '\n',
    )
    const { engine } = boot()
    assert.equal(engine.state().settings.theme, 'dark')
    assert.equal(engine.state().settings.openAtLogin, true)
  })

  it('writes a snapshot every 500 events and resumes from it', () => {
    const j = openJournal(dir, { snapshotEvery: 5 })
    let state = j.initialState
    for (let i = 0; i < 12; i++) {
      const e = /** @type {any} */ ({
        type: 'StopwatchChanged',
        v: 1,
        at: i,
        stopwatch: { startedAt: null, accumulatedMs: i, laps: [] },
      })
      state = { ...state, stopwatch: e.stopwatch }
      j.append([e], state)
    }
    j.close()
    const snap = JSON.parse(fs.readFileSync(path.join(dir, 'snapshot.json'), 'utf8'))
    assert.equal(snap.state.stopwatch.accumulatedMs, 9)
    const again = openJournal(dir)
    assert.equal(again.initialState.stopwatch.accumulatedMs, 11)
    assert.equal(again.stats.applied, 2) // only the lines after the snapshot
    again.close()
  })

  it('compacts a journal larger than the limit at start', () => {
    const j = openJournal(dir)
    let state = j.initialState
    for (let i = 0; i < 50; i++) {
      const e = /** @type {any} */ ({
        type: 'StopwatchChanged',
        v: 1,
        at: i,
        stopwatch: { startedAt: null, accumulatedMs: i, laps: [] },
      })
      state = { ...state, stopwatch: e.stopwatch }
      j.append([e], state)
    }
    j.close()
    const again = openJournal(dir, { compactAboveBytes: 1000 })
    again.close()
    assert.equal(fs.statSync(path.join(dir, 'journal.jsonl')).size, 0)
    const third = openJournal(dir)
    assert.equal(third.initialState.stopwatch.accumulatedMs, 49)
    third.close()
  })

  it('appends are fsynced before the projection goes out', () => {
    const { send } = boot()
    const orig = fs.fsyncSync
    /** @type {string[]} */
    const order = []
    fs.fsyncSync = (fd) => {
      order.push('fsync')
      return orig(fd)
    }
    try {
      const b = boot()
      b.engine.connect('ui', () => order.push('send'))
      order.length = 0
      b.send('ui', { type: 'StopwatchStart' })
    } finally {
      fs.fsyncSync = orig
    }
    assert.equal(order[0], 'fsync')
    assert.ok(order.indexOf('send') > order.indexOf('fsync'))
    void send
  })
})

describe('test clock', () => {
  it('TestSetClock in test mode moves the clock and ticks', () => {
    const { send, clock, engine, lastProjection } = boot({ testMode: true })
    send('ui', { type: 'SaveAlarm', alarm: draft() })
    send('shell', { type: 'TestSetClock', now: new Date(2026, 10, 3, 7, 30, 1).getTime() })
    assert.notEqual(engine.state().alarms[0].ringingSince, null)
    assert.ok(Math.abs(lastProjection().clockOffsetMs - (clock.now() - Date.now())) < 50)
  })
})
