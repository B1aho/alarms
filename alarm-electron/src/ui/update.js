/**
 * update(model, msg) → [model, effects]. Pure: no DOM, no clock, no randomness
 * (the generator state lives in `model.seed`). Effects are descriptions run by the runtime.
 */

import { newAlarmDraft, draftOf } from '../domain/schedule.js'
import { generateProblem, seededRng } from '../domain/tasks.js'
import { nowOf, ringingAlarm } from './model.js'

/** @typedef {import('./model.js').Model} Model */
/** @typedef {import('./model.js').SoundTarget} SoundTarget */
/** @typedef {import('./model.js').EditorPage} EditorPage */
/** @typedef {import('./model.js').Route} Route */
/** @typedef {import('../contract/commands.js').SoundRef} SoundRef */
/** @typedef {import('../contract/commands.js').AlarmDraft} AlarmDraft */
/** @typedef {import('../contract/commands.js').Task} Task */

/**
 * @typedef {{ type: 'send', msg: Record<string, unknown> & { type: string } }
 *   | { type: 'pickFile', target: SoundTarget }
 *   | { type: 'requestNotifications' }
 *   | { type: 'focus', selector: string }} Effect
 */

/**
 * @typedef {{ type: 'Projection', state: import('../contract/transient.js').Projection }
 *   | { type: 'Tick', now: number } | { type: 'Frame', now: number } | { type: 'SystemTheme', dark: boolean }
 *   | { type: 'Navigate', route: Route } | { type: 'Escape' }
 *   | { type: 'ToggleEditMode' } | { type: 'AskDelete', id: string } | { type: 'DeleteAlarm', id: string }
 *   | { type: 'SetEnabled', id: string, enabled: boolean } | { type: 'CancelSnooze', id: string }
 *   | { type: 'OpenNewAlarm' } | { type: 'OpenAlarm', id: string } | { type: 'RequestNotifications' }
 *   | { type: 'EditorCancel' } | { type: 'EditorSave' } | { type: 'EditorDelete' } | { type: 'EditorPage', page: EditorPage }
 *   | { type: 'DraftTime', hour: number, minute: number } | { type: 'DraftLabel', label: string }
 *   | { type: 'DraftToggleDay', day: number } | { type: 'DraftSnooze', on: boolean } | { type: 'DraftVolume', volume: number }
 *   | { type: 'DraftRamp', seconds: number } | { type: 'DraftTask', task: Task } | { type: 'TogglePreview' }
 *   | { type: 'ChooseSound', target: SoundTarget, sound: SoundRef } | { type: 'ChooseFile', target: SoundTarget }
 *   | { type: 'FilePicked', target: SoundTarget, file: { path: string, name: string } | null }
 *   | { type: 'RemoveSound', id: string } | { type: 'SetSetting', patch: import('../contract/commands.js').SettingsPatch }
 *   | { type: 'OpenSheet', sheet: 'timerSound' | 'defaultSound' } | { type: 'CloseSheet' }
 *   | { type: 'TimerWheel', h: number, m: number, s: number } | { type: 'TimerStart' } | { type: 'TimerPause' }
 *   | { type: 'TimerResume' } | { type: 'TimerCancel' } | { type: 'TimerLabelInput', label: string } | { type: 'TimerLabelBlur' }
 *   | { type: 'StartRecent', durationMs: number, label: string } | { type: 'RemoveRecent', durationMs: number }
 *   | { type: 'TimerAlertStop' } | { type: 'TimerAlertRepeat' }
 *   | { type: 'SwStart' } | { type: 'SwStop' } | { type: 'SwLap' } | { type: 'SwReset' } | { type: 'SwToggle' } | { type: 'SwLapReset' }
 *   | { type: 'RingSnooze' } | { type: 'RingStop' } | { type: 'RingInput', value: string } | { type: 'RingSubmit' } | { type: 'RingBack' }
 * } Msg
 */

/** @param {Record<string, unknown> & { type: string }} msg @returns {Effect} */
const send = (msg) => ({ type: 'send', msg })
const previewStop = () => send({ type: 'PreviewStop' })

/** Draws one value from the model's generator. @param {Model} m */
function rng(m) {
  const r = seededRng(m.seed)
  return { rand: r, next: () => Math.floor(r() * 4294967296) >>> 0 }
}

/** @param {Model} m @param {Task} task @returns {[import('../contract/events.js').Problem | null, number]} */
function example(m, task) {
  const { rand, next } = rng(m)
  const problem = generateProblem(task, rand)
  return [problem, next()]
}

/**
 * Sound chosen in a picker: apply it to the target and play it once (§3.8).
 * @param {Model} m
 * @param {SoundTarget} target
 * @param {SoundRef} sound
 * @returns {[Model, Effect[]]}
 */
function chooseSound(m, target, sound) {
  if (!m.app) return [m, []]
  /** @type {Effect[]} */
  const fx = []
  let volume = m.app.settings.volume
  if (target === 'editor' && m.editor) {
    m = { ...m, editor: { ...m.editor, draft: { ...m.editor.draft, sound } } }
    volume = m.editor?.draft.volume ?? volume
  } else if (target === 'timer') {
    fx.push(send({ type: 'SetTimerSound', sound }))
    volume = 0.9
  } else if (target === 'default') {
    fx.push(send({ type: 'UpdateSettings', patch: { defaultSound: sound } }))
  } else {
    return [m, fx]
  }
  fx.push(send({ type: 'PreviewPlay', sound, url: null, volume, rampSeconds: 0, loop: false }))
  return [m, fx]
}

/** @param {Model} m @returns {[Model, Effect[]]} */
function closeEditor(m) {
  return [{ ...m, editor: null }, m.editor ? [previewStop()] : []]
}

/**
 * @param {Model} model
 * @param {Msg} msg
 * @returns {[Model, Effect[]]}
 */
export function update(model, msg) {
  const m = model
  const app = m.app
  switch (msg.type) {
    case 'Projection':
      return onProjection(m, msg.state)
    case 'Tick':
    case 'Frame':
      return [{ ...m, now: msg.now }, []]
    case 'SystemTheme':
      return [{ ...m, systemDark: msg.dark }, []]

    case 'Navigate': {
      if (msg.route === m.route) return [m, []]
      const stop = m.editor || m.sheet ? [previewStop()] : []
      return [{ ...m, route: msg.route, editor: null, sheet: null, editMode: false, confirmDelete: null, timerLabel: null }, stop]
    }
    case 'Escape':
      if (m.editor) return closeEditor(m)
      if (m.sheet) return [{ ...m, sheet: null }, [previewStop()]]
      return [m, []]

    // ── alarms list ──
    case 'ToggleEditMode':
      return [{ ...m, editMode: !m.editMode, confirmDelete: null }, []]
    case 'AskDelete':
      return [{ ...m, confirmDelete: m.confirmDelete === msg.id ? null : msg.id }, []]
    case 'DeleteAlarm': {
      const rest = (app?.alarms.length ?? 0) <= 1
      return [{ ...m, confirmDelete: null, editMode: rest ? false : m.editMode }, [send({ type: 'DeleteAlarm', id: msg.id })]]
    }
    case 'SetEnabled':
      return [m, [send({ type: 'SetAlarmEnabled', id: msg.id, enabled: msg.enabled })]]
    case 'CancelSnooze':
      return [m, [send({ type: 'CancelSnooze', id: msg.id })]]
    case 'RequestNotifications':
      return [m, [{ type: 'requestNotifications' }]]
    case 'OpenNewAlarm':
      if (!app) return [m, []]
      return [
        {
          ...m,
          editor: { draft: newAlarmDraft(app.settings, nowOf(m)), isNew: true, page: 'main', previewing: false, example: null },
        },
        [],
      ]
    case 'OpenAlarm': {
      const a = app?.alarms.find((x) => x.id === msg.id)
      if (!a) return [m, []]
      return [{ ...m, editor: { draft: draftOf(a), isNew: false, page: 'main', previewing: false, example: null } }, []]
    }

    // ── editor ──
    case 'EditorCancel':
      return closeEditor(m)
    case 'EditorSave': {
      if (!m.editor) return [m, []]
      const [next, fx] = closeEditor(m)
      // Save closes the sheet at once; the engine stores it (§3.3).
      return [next, [send({ type: 'SaveAlarm', alarm: m.editor.draft }), ...fx]]
    }
    case 'EditorDelete': {
      if (!m.editor) return [m, []]
      const [next, fx] = closeEditor(m)
      return [next, [send({ type: 'DeleteAlarm', id: m.editor.draft.id }), ...fx]]
    }
    case 'EditorPage': {
      if (!m.editor) return [m, []]
      /** @type {Effect[]} */
      const fx = m.editor.previewing || m.editor.page === 'sound' ? [previewStop()] : []
      let editor = { ...m.editor, page: msg.page, previewing: false }
      let seed = m.seed
      if (msg.page === 'task') {
        const [problem, nextSeed] = example(m, editor.draft.task)
        editor = { ...editor, example: problem }
        seed = nextSeed
      }
      return [{ ...m, editor, seed, importError: msg.page === 'main' ? null : m.importError }, fx]
    }
    case 'DraftTime':
    case 'DraftLabel':
    case 'DraftSnooze':
    case 'DraftVolume':
    case 'DraftRamp':
    case 'DraftToggleDay': {
      if (!m.editor) return [m, []]
      const d = m.editor.draft
      /** @type {AlarmDraft} */
      const draft =
        msg.type === 'DraftTime'
          ? { ...d, hour: msg.hour, minute: msg.minute }
          : msg.type === 'DraftLabel'
            ? { ...d, label: msg.label.slice(0, 60) }
            : msg.type === 'DraftSnooze'
              ? { ...d, snooze: msg.on }
              : msg.type === 'DraftVolume'
                ? { ...d, volume: Math.round(msg.volume * 20) / 20 }
                : msg.type === 'DraftRamp'
                  ? { ...d, rampSeconds: msg.seconds }
                  : { ...d, days: d.days.includes(msg.day) ? d.days.filter((x) => x !== msg.day) : [...d.days, msg.day].sort() }
      return [{ ...m, editor: { ...m.editor, draft } }, []]
    }
    case 'DraftTask': {
      if (!m.editor) return [m, []]
      // The example is regenerated on every change of the task settings (§3.3).
      const [problem, seed] = example(m, msg.task)
      return [{ ...m, seed, editor: { ...m.editor, draft: { ...m.editor.draft, task: msg.task }, example: problem } }, []]
    }
    case 'TogglePreview': {
      if (!m.editor) return [m, []]
      const d = m.editor.draft
      if (m.editor.previewing) return [{ ...m, editor: { ...m.editor, previewing: false } }, [previewStop()]]
      return [
        { ...m, editor: { ...m.editor, previewing: true } },
        [send({ type: 'PreviewPlay', sound: d.sound, url: null, volume: d.volume, rampSeconds: d.rampSeconds, loop: true })],
      ]
    }

    // ── sounds ──
    case 'ChooseSound':
      return chooseSound({ ...m, importError: null }, msg.target, msg.sound)
    case 'ChooseFile':
      return [{ ...m, importError: null }, [{ type: 'pickFile', target: msg.target }]]
    case 'FilePicked': {
      if (!msg.file) return [m, []]
      const { next } = rng(m)
      const seed = next()
      const requestId = `r${seed.toString(36)}`
      return [
        { ...m, seed, importReq: { requestId, target: msg.target }, importError: null },
        [send({ type: 'ImportSound', requestId, path: msg.file.path, name: msg.file.name.slice(0, 255), size: 0 })],
      ]
    }
    case 'RemoveSound':
      return [m, [send({ type: 'RemoveSound', id: msg.id })]]
    case 'SetSetting':
      return [m, [send({ type: 'UpdateSettings', patch: msg.patch })]]
    case 'OpenSheet':
      return [{ ...m, sheet: msg.sheet, importError: null }, []]
    case 'CloseSheet':
      return [{ ...m, sheet: null }, [previewStop()]]

    // ── timer ──
    case 'TimerWheel':
      return [m, [send({ type: 'SetTimerDuration', durationMs: Math.max(1, msg.h * 3600 + msg.m * 60 + msg.s) * 1000 })]]
    case 'TimerStart':
      return [m, [send({ type: 'StartTimer' })]]
    case 'TimerPause':
      return [m, [send({ type: 'PauseTimer' })]]
    case 'TimerResume':
      return [m, [send({ type: 'ResumeTimer' })]]
    case 'TimerCancel':
      return [m, [send({ type: 'CancelTimer' })]]
    case 'TimerLabelInput': {
      const label = msg.label.slice(0, 60)
      return [{ ...m, timerLabel: label }, [send({ type: 'SetTimerLabel', label })]]
    }
    case 'TimerLabelBlur':
      return [{ ...m, timerLabel: null }, []]
    case 'StartRecent':
      return [m, [send({ type: 'StartTimer', durationMs: msg.durationMs, label: msg.label })]]
    case 'RemoveRecent':
      return [m, [send({ type: 'RemoveRecent', durationMs: msg.durationMs })]]
    case 'TimerAlertStop':
      return [m, [send({ type: 'StopTimerAlert' })]]
    case 'TimerAlertRepeat':
      return [m, [send({ type: 'RepeatTimer' })]]

    // ── stopwatch ──
    case 'SwStart':
      return [m, [send({ type: 'StopwatchStart' })]]
    case 'SwStop':
      return [m, [send({ type: 'StopwatchStop' })]]
    case 'SwLap':
      return [m, [send({ type: 'StopwatchLap' })]]
    case 'SwReset':
      return [m, [send({ type: 'StopwatchReset' })]]
    case 'SwToggle': {
      if (!app || m.route !== 'stopwatch') return [m, []]
      return [m, [send({ type: app.stopwatch.startedAt !== null ? 'StopwatchStop' : 'StopwatchStart' })]]
    }
    case 'SwLapReset': {
      if (!app || m.route !== 'stopwatch') return [m, []]
      const sw = app.stopwatch
      if (sw.startedAt !== null) return [m, [send({ type: 'StopwatchLap' })]]
      if (sw.accumulatedMs > 0) return [m, [send({ type: 'StopwatchReset' })]]
      return [m, []]
    }

    // ── ringing ──
    case 'RingSnooze': {
      const a = ringingAlarm(m)
      return a ? [m, [send({ type: 'Snooze', id: a.id })]] : [m, []]
    }
    case 'RingStop': {
      const a = ringingAlarm(m)
      if (!a) return [m, []]
      if (a.task.type === 'none') return [m, [send({ type: 'Stop', id: a.id })]]
      return [
        {
          ...m,
          ringing: {
            ...m.ringing,
            id: a.id,
            stage: 'task',
            input: '',
            seenFailures: 0,
            round: (m.app?.tasks[a.id]?.round ?? 0) + 1,
          },
        },
        [send({ type: 'Stop', id: a.id }), { type: 'focus', selector: '.task-input' }],
      ]
    }
    case 'RingInput':
      return [{ ...m, ringing: { ...m.ringing, input: msg.value.slice(0, 40) } }, []]
    case 'RingSubmit': {
      const a = ringingAlarm(m)
      if (!a || !m.ringing.input.trim()) return [m, []]
      return [
        { ...m, ringing: { ...m.ringing, input: '' } },
        [send({ type: 'SubmitAnswer', id: a.id, answer: m.ringing.input }), { type: 'focus', selector: '.task-input' }],
      ]
    }
    case 'RingBack':
      return [{ ...m, ringing: { ...m.ringing, stage: 'idle', input: '' } }, [{ type: 'focus', selector: '.ring-primary' }]]
  }
  return [m, []]
}

/**
 * @param {Model} m
 * @param {import('../contract/transient.js').Projection} state
 * @returns {[Model, Effect[]]}
 */
function onProjection(m, state) {
  /** @type {Model} */
  let next = { ...m, app: state }
  /** @type {Effect[]} */
  let fx = []

  // A finished import selects the new sound for whoever asked (§3.8 "added file is selected at once").
  const imp = state.soundImport
  if (m.importReq && imp && imp.requestId === m.importReq.requestId) {
    const target = m.importReq.target
    if (imp.status === 'done' && imp.soundId) {
      next = { ...next, importReq: null }
      ;[next, fx] = chooseSound(next, target, { kind: 'custom', id: imp.soundId })
    } else if (imp.status === 'error') {
      next = { ...next, importReq: null, importError: { target, text: imp.error ?? '' } }
    }
  }

  // Ringing screen: reset per alarm; a new failure shakes the task and clears the field.
  const ring = state.alarms.find((a) => a.ringingSince !== null) ?? null
  if (!ring) {
    if (m.ringing.id !== null)
      next = { ...next, ringing: { id: null, stage: 'idle', input: '', shake: 0, seenFailures: 0, round: 0 } }
  } else if (ring.id !== m.ringing.id) {
    next = { ...next, ringing: { id: ring.id, stage: 'idle', input: '', shake: 0, seenFailures: 0, round: 0 } }
  } else {
    const task = state.tasks[ring.id]
    if (task && task.round >= m.ringing.round && task.failures > m.ringing.seenFailures) {
      next = { ...next, ringing: { ...next.ringing, shake: next.ringing.shake + 1, seenFailures: task.failures, input: '' } }
    }
    if (!task && m.ringing.stage === 'task' && m.app?.tasks[ring.id]) {
      next = { ...next, ringing: { ...next.ringing, stage: 'idle' } }
    }
  }
  return [next, fx]
}
