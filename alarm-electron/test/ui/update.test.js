import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { update } from '../../src/ui/update.js'
import { init, nowOf, themeOf, hourCycleOf } from '../../src/ui/model.js'
import { keyToMsg } from '../../src/ui/keyboard.js'
import { initialState } from '../../src/domain/defaults.js'
import { project } from '../../src/domain/projections.js'

const NOW = new Date(2026, 10, 10, 11, 51).getTime()

/** @param {Partial<import('../../src/domain/defaults.js').State>} [patch] */
function projection(patch = {}) {
  return project(
    { ...initialState(), ...patch },
    {
      system: { hourCycle: '24h', platform: 'darwin', version: '1.0.0', notifications: 'granted' },
      soundImport: null,
      previewing: false,
      clockOffsetMs: 0,
    },
  )
}

/** @param {any} [patch] */
const alarm = (patch = {}) => ({
  id: 'a1',
  hour: 7,
  minute: 30,
  label: 'Work',
  enabled: true,
  days: [],
  sound: { kind: 'builtin', id: 'sunrise' },
  volume: 0.9,
  rampSeconds: 60,
  snooze: true,
  task: { type: 'math', difficulty: 'medium', count: 2 },
  createdAt: 1,
  nextTriggerAt: NOW + 1000,
  snoozeUntil: null,
  ringingSince: null,
  ...patch,
})

const base = () => {
  const m = init({ now: NOW, seed: 42, systemDark: true, platform: 'darwin' })
  return update(m, { type: 'Projection', state: projection({ alarms: [alarm()] }) })[0]
}

/** @param {any[]} fx */
const sent = (fx) => fx.filter((e) => e.type === 'send').map((e) => e.msg)

describe('update is a pure function', () => {
  it('does not mutate the model and is deterministic', () => {
    const m = base()
    const frozen = JSON.stringify(m)
    const a = update(m, { type: 'OpenNewAlarm' })
    const b = update(m, { type: 'OpenNewAlarm' })
    assert.equal(JSON.stringify(m), frozen)
    assert.deepEqual(a, b)
  })
  it('new alarm draft: current time and defaults (§2.1)', () => {
    const [m] = update(base(), { type: 'OpenNewAlarm' })
    assert.equal(m.editor?.isNew, true)
    assert.equal(m.editor?.draft.hour, 11)
    assert.equal(m.editor?.draft.minute, 51)
    assert.equal(m.editor?.draft.id, '')
    assert.deepEqual(m.editor?.draft.task, { type: 'math', difficulty: 'medium', count: 2 })
    assert.equal(m.editor?.draft.volume, 0.9)
  })
  it('Save sends SaveAlarm and closes the sheet at once (§3.3)', () => {
    let [m] = update(base(), { type: 'OpenAlarm', id: 'a1' })
    ;[m] = update(m, { type: 'DraftLabel', label: 'Gym' })
    const [after, fx] = update(m, { type: 'EditorSave' })
    assert.equal(after.editor, null)
    assert.equal(sent(fx)[0].type, 'SaveAlarm')
    assert.equal(sent(fx)[0].alarm.label, 'Gym')
    assert.equal(sent(fx)[0].alarm.id, 'a1')
  })
  it('Cancel / Esc discard the draft and stop previews', () => {
    let [m] = update(base(), { type: 'OpenAlarm', id: 'a1' })
    ;[m] = update(m, { type: 'DraftLabel', label: 'X' })
    const [c, fx] = update(m, { type: 'Escape' })
    assert.equal(c.editor, null)
    assert.deepEqual(sent(fx), [{ type: 'PreviewStop' }])
  })
  it('sub-pages edit the draft; repeat days toggle', () => {
    let [m] = update(base(), { type: 'OpenNewAlarm' })
    ;[m] = update(m, { type: 'EditorPage', page: 'repeat' })
    ;[m] = update(m, { type: 'DraftToggleDay', day: 1 })
    ;[m] = update(m, { type: 'DraftToggleDay', day: 5 })
    ;[m] = update(m, { type: 'DraftToggleDay', day: 1 })
    assert.deepEqual(m.editor?.draft.days, [5])
  })
  it('task page regenerates the example on every change', () => {
    let [m] = update(base(), { type: 'OpenNewAlarm' })
    ;[m] = update(m, { type: 'EditorPage', page: 'task' })
    const first = m.editor?.example
    assert.ok(first?.prompt.includes('×'))
    ;[m] = update(m, { type: 'DraftTask', task: { type: 'retype', difficulty: 'hard', count: 3 } })
    assert.equal(m.editor?.example?.kind, 'retype')
    assert.equal(m.editor?.example?.answer.length, 14)
    ;[m] = update(m, { type: 'DraftTask', task: { type: 'none', difficulty: 'hard', count: 3 } })
    assert.equal(m.editor?.example, null)
  })
  it('Preview Wake-up toggles and plays with draft volume and ramp, looping', () => {
    let [m] = update(base(), { type: 'OpenNewAlarm' })
    let fx
    ;[m, fx] = update(m, { type: 'TogglePreview' })
    assert.deepEqual(sent(fx)[0], {
      type: 'PreviewPlay',
      sound: { kind: 'builtin', id: 'sunrise' },
      url: null,
      volume: 0.9,
      rampSeconds: 60,
      loop: true,
    })
    ;[m, fx] = update(m, { type: 'TogglePreview' })
    assert.deepEqual(sent(fx), [{ type: 'PreviewStop' }])
    ;[m] = update(m, { type: 'TogglePreview' })
    const [, leave] = update(m, { type: 'EditorPage', page: 'sound' })
    assert.deepEqual(sent(leave), [{ type: 'PreviewStop' }])
  })
  it('choosing a sound selects it and plays it once without ramp (timer at 0.9)', () => {
    const [, fx] = update(base(), { type: 'ChooseSound', target: 'timer', sound: { kind: 'builtin', id: 'harp' } })
    assert.deepEqual(sent(fx), [
      { type: 'SetTimerSound', sound: { kind: 'builtin', id: 'harp' } },
      { type: 'PreviewPlay', sound: { kind: 'builtin', id: 'harp' }, url: null, volume: 0.9, rampSeconds: 0, loop: false },
    ])
  })
  it('imported file is selected for the target that asked for it', () => {
    let [m] = update(base(), { type: 'OpenNewAlarm' })
    let fx
    ;[m, fx] = update(m, { type: 'FilePicked', target: 'editor', file: { path: '/x/Song.mp3', name: 'Song.mp3' } })
    const req = sent(fx)[0]
    assert.equal(req.type, 'ImportSound')
    const done = projection({ alarms: [alarm()], sounds: [{ id: 's1', name: 'Song', size: 1, addedAt: 1, ext: 'mp3' }] })
    ;[m, fx] = update(m, {
      type: 'Projection',
      state: { ...done, soundImport: { requestId: req.requestId, status: 'done', error: null, soundId: 's1' } },
    })
    assert.deepEqual(m.editor?.draft.sound, { kind: 'custom', id: 's1' })
    assert.equal(m.importReq, null)
    assert.equal(sent(fx)[0].type, 'PreviewPlay')
  })
  it('import errors are shown for that target only', () => {
    let [m] = update(base(), { type: 'FilePicked', target: 'library', file: { path: '/x/a.txt', name: 'a.txt' } })
    const req = sent(update(base(), { type: 'FilePicked', target: 'library', file: { path: '/x/a.txt', name: 'a.txt' } })[1])[0]
    ;[m] = update(m, {
      type: 'Projection',
      state: {
        ...projection(),
        soundImport: { requestId: req.requestId, status: 'error', error: 'That file is not an audio file.', soundId: null },
      },
    })
    assert.deepEqual(m.importError, { target: 'library', text: 'That file is not an audio file.' })
  })
  it('edit mode: minus toggles Delete; Delete sends DeleteAlarm', () => {
    let [m] = update(base(), { type: 'ToggleEditMode' })
    ;[m] = update(m, { type: 'AskDelete', id: 'a1' })
    assert.equal(m.confirmDelete, 'a1')
    ;[m] = update(m, { type: 'AskDelete', id: 'a1' })
    assert.equal(m.confirmDelete, null)
    const [, fx] = update(m, { type: 'DeleteAlarm', id: 'a1' })
    assert.deepEqual(sent(fx), [{ type: 'DeleteAlarm', id: 'a1' }])
  })
  it('timer wheels never go below 1 s', () => {
    const [, fx] = update(base(), { type: 'TimerWheel', h: 0, m: 0, s: 0 })
    assert.deepEqual(sent(fx), [{ type: 'SetTimerDuration', durationMs: 1000 }])
  })
  it('stopwatch keys: Space start/stop, L lap or reset', () => {
    let [m] = update(base(), { type: 'Navigate', route: 'stopwatch' })
    assert.deepEqual(sent(update(m, { type: 'SwToggle' })[1]), [{ type: 'StopwatchStart' }])
    assert.deepEqual(sent(update(m, { type: 'SwLapReset' })[1]), [])
    ;[m] = update(m, { type: 'Projection', state: projection({ stopwatch: { startedAt: NOW, accumulatedMs: 0, laps: [] } }) })
    assert.deepEqual(sent(update(m, { type: 'SwToggle' })[1]), [{ type: 'StopwatchStop' }])
    assert.deepEqual(sent(update(m, { type: 'SwLapReset' })[1]), [{ type: 'StopwatchLap' }])
    ;[m] = update(m, { type: 'Projection', state: projection({ stopwatch: { startedAt: null, accumulatedMs: 500, laps: [] } }) })
    assert.deepEqual(sent(update(m, { type: 'SwLapReset' })[1]), [{ type: 'StopwatchReset' }])
  })
  it('ringing: Stop with a task opens the task card; failures shake and clear', () => {
    const ringing = projection({ alarms: [alarm({ ringingSince: NOW })] })
    let [m] = update(base(), { type: 'Projection', state: ringing })
    let fx
    ;[m, fx] = update(m, { type: 'RingStop' })
    assert.equal(m.ringing.stage, 'task')
    assert.deepEqual(sent(fx), [{ type: 'Stop', id: 'a1' }])
    const task = { kind: /** @type {const} */ ('math'), prompt: '3 × 12 + 11', solved: 0, total: 2, failures: 0, round: 1 }
    ;[m] = update(m, { type: 'Projection', state: { ...ringing, tasks: { a1: task } } })
    ;[m] = update(m, { type: 'RingInput', value: '12' })
    ;[m, fx] = update(m, { type: 'RingSubmit' })
    assert.deepEqual(sent(fx), [{ type: 'SubmitAnswer', id: 'a1', answer: '12' }])
    ;[m] = update(m, {
      type: 'Projection',
      state: { ...ringing, tasks: { a1: { ...task, failures: 1, prompt: '4 × 13 + 20' } } },
    })
    assert.equal(m.ringing.shake, 1)
    assert.equal(m.ringing.input, '')
    ;[m] = update(m, { type: 'RingBack' })
    assert.equal(m.ringing.stage, 'idle')
  })
  it('ringing: Stop without a task dismisses; Snooze snoozes', () => {
    const ringing = projection({ alarms: [alarm({ ringingSince: NOW, task: { type: 'none', difficulty: 'easy', count: 1 } })] })
    const [m] = update(base(), { type: 'Projection', state: ringing })
    assert.deepEqual(sent(update(m, { type: 'RingStop' })[1]), [{ type: 'Stop', id: 'a1' }])
    assert.equal(update(m, { type: 'RingStop' })[0].ringing.stage, 'idle')
    assert.deepEqual(sent(update(m, { type: 'RingSnooze' })[1]), [{ type: 'Snooze', id: 'a1' }])
  })
  it('selectors: engine clock offset, theme, hour cycle', () => {
    let [m] = update(base(), { type: 'Projection', state: { ...projection(), clockOffsetMs: 5000 } })
    assert.equal(nowOf(m), NOW + 5000)
    assert.equal(themeOf(m), 'dark')
    ;[m] = update(m, { type: 'SystemTheme', dark: false })
    assert.equal(themeOf(m), 'light')
    assert.equal(hourCycleOf(m), '24h')
  })
})

describe('keyboard', () => {
  const k = (/** @type {Partial<import('../../src/ui/keyboard.js').KeyInfo>} */ p) => ({
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    inField: false,
    onButton: false,
    ...p,
  })
  const ctx = { route: /** @type {const} */ ('alarms'), modal: false, ringing: false, platform: 'darwin' }
  it('⌘1…4 on macOS, Ctrl on Windows/Linux', () => {
    assert.deepEqual(keyToMsg(k({ key: '3', metaKey: true }), ctx)?.msg, { type: 'Navigate', route: 'timer' })
    assert.equal(keyToMsg(k({ key: '3', ctrlKey: true }), ctx), null)
    assert.deepEqual(keyToMsg(k({ key: '4', ctrlKey: true }), { ...ctx, platform: 'win32' })?.msg, {
      type: 'Navigate',
      route: 'settings',
    })
    assert.deepEqual(keyToMsg(k({ key: '2', ctrlKey: true }), { ...ctx, platform: 'linux' })?.msg, {
      type: 'Navigate',
      route: 'stopwatch',
    })
  })
  it('Space and L only on the stopwatch and never in a field', () => {
    const sw = { ...ctx, route: /** @type {const} */ ('stopwatch') }
    assert.deepEqual(keyToMsg(k({ code: 'Space', key: ' ' }), sw), { msg: { type: 'SwToggle' }, prevent: true })
    assert.deepEqual(keyToMsg(k({ key: 'l' }), sw)?.msg, { type: 'SwLapReset' })
    assert.deepEqual(keyToMsg(k({ key: 'L' }), sw)?.msg, { type: 'SwLapReset' })
    assert.equal(keyToMsg(k({ code: 'Space', key: ' ', inField: true }), sw), null)
    assert.equal(keyToMsg(k({ code: 'Space', key: ' ' }), ctx), null)
  })
  it('Esc closes a sheet', () => {
    assert.deepEqual(keyToMsg(k({ key: 'Escape' }), { ...ctx, modal: true })?.msg, { type: 'Escape' })
    assert.equal(keyToMsg(k({ key: 'Escape' }), ctx), null)
  })
})
