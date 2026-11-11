/**
 * The decider: decide(state, command, now, rng) → events.
 * Pure: the clock and the random generator are arguments. Never mutates `state`.
 */

import { EVENT_VERSION } from '../contract/events.js'
import { AUDIO_EXTENSIONS, MAX_SOUND_BYTES } from './defaults.js'
import { advanceAfterTrigger, evaluate, nextOccurrence, TIMER_LATE_LIMIT_MS } from './schedule.js'
import { S } from './strings.js'
import { checkAnswer, generateProblem, makeId } from './tasks.js'

/** @typedef {import('./defaults.js').State} State */
/** @typedef {import('./tasks.js').Rng} Rng */
/** @typedef {import('../contract/commands.js').Command} Command */
/** @typedef {import('../contract/events.js').JournalEvent} JournalEvent */
/** @typedef {import('../contract/events.js').Alarm} Alarm */
/** @typedef {import('../contract/events.js').Timer} Timer */
/** @typedef {import('../contract/events.js').CustomSound} CustomSound */

/**
 * Engine-internal commands (never cross a process boundary).
 * @typedef {{ type: 'Tick' } | { type: 'AddSound', sound: CustomSound }} InternalCommand
 */

/**
 * @template {JournalEvent['type']} T
 * @param {T} type
 * @param {number} now
 * @param {Omit<Extract<JournalEvent, { type: T }>, 'type' | 'v' | 'at'>} payload
 * @returns {JournalEvent}
 */
const ev = (type, now, payload) =>
  /** @type {JournalEvent} */ (/** @type {unknown} */ ({ type, v: EVENT_VERSION, at: now, ...payload }))

/**
 * Validation of a music file before it is copied (§3.8). Returns the error text or null.
 * @param {string} fileName
 * @param {number} size
 */
export function importError(fileName, size) {
  const ext = extensionOf(fileName)
  if (!ext || !(/** @type {readonly string[]} */ (AUDIO_EXTENSIONS).includes(ext))) return S.notAudio
  if (size > MAX_SOUND_BYTES) return S.tooLarge
  return null
}

/** @param {string} fileName */
export function extensionOf(fileName) {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName)
  return m ? m[1].toLowerCase() : null
}

/** Name shown in the list: file name without extension. @param {string} fileName */
export const soundNameFromFile = (fileName) => fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')

/** @param {Timer} timer @param {number} durationMs @param {string} label @param {number} now @returns {Timer} */
function startTimer(timer, durationMs, label, now) {
  const recents = [{ durationMs, label }, ...timer.recents.filter((r) => r.durationMs !== durationMs)].slice(0, 6)
  return { ...timer, status: 'running', durationMs, label, endsAt: now + durationMs, remainingMs: durationMs, recents }
}

/**
 * @param {State} state
 * @param {Command | InternalCommand} cmd
 * @param {number} now
 * @param {Rng} rng
 * @returns {JournalEvent[]}
 */
export function decide(state, cmd, now, rng) {
  const find = (/** @type {string} */ id) => state.alarms.find((a) => a.id === id)
  const timer = state.timer
  const sw = state.stopwatch

  switch (cmd.type) {
    case 'Tick':
      return decideTick(state, now)

    case 'SaveAlarm': {
      const d = cmd.alarm
      const existing = d.id ? find(d.id) : undefined
      const days = [...new Set(d.days)].sort((a, b) => a - b)
      /** @type {Alarm} */
      const alarm = {
        id: existing ? existing.id : makeId(rng),
        hour: d.hour,
        minute: d.minute,
        label: d.label.slice(0, 60),
        enabled: true,
        days,
        sound: d.sound,
        volume: d.volume,
        rampSeconds: d.rampSeconds,
        snooze: d.snooze,
        task: d.task,
        createdAt: existing ? existing.createdAt : now,
        nextTriggerAt: nextOccurrence({ hour: d.hour, minute: d.minute, days }, now),
        snoozeUntil: null,
        ringingSince: null,
      }
      return [ev('AlarmSaved', now, { alarm })]
    }

    case 'DeleteAlarm':
      return find(cmd.id) ? [ev('AlarmDeleted', now, { id: cmd.id })] : []

    case 'SetAlarmEnabled': {
      const a = find(cmd.id)
      if (!a) return []
      const nextTriggerAt = cmd.enabled ? nextOccurrence(a, now) : null
      return [ev('AlarmEnabledChanged', now, { id: a.id, enabled: cmd.enabled, nextTriggerAt })]
    }

    case 'CancelSnooze': {
      const a = find(cmd.id)
      return a && a.snoozeUntil !== null ? [ev('SnoozeCancelled', now, { id: a.id })] : []
    }

    case 'Snooze': {
      const a = find(cmd.id)
      if (!a || a.ringingSince === null || !a.snooze) return []
      return [ev('AlarmSnoozed', now, { id: a.id, until: now + state.settings.snoozeMinutes * 60_000 })]
    }

    case 'Stop': {
      const a = find(cmd.id)
      if (!a || a.ringingSince === null) return []
      const problem = generateProblem(a.task, rng)
      if (!problem) return [ev('AlarmDismissed', now, { id: a.id })]
      // Each Stop starts a fresh round (new problem, progress from zero), like the reference.
      return [ev('TaskIssued', now, { id: a.id, round: (state.tasks[a.id]?.round ?? 0) + 1, problem })]
    }

    case 'SubmitAnswer': {
      const a = find(cmd.id)
      const t = state.tasks[cmd.id]
      if (!a || a.ringingSince === null || !t) return []
      if (checkAnswer(t.problem, cmd.answer)) {
        const solved = t.solved + 1
        if (solved >= a.task.count) {
          return [ev('TaskSolved', now, { id: a.id, solved, problem: null }), ev('AlarmDismissed', now, { id: a.id })]
        }
        const next = generateProblem(a.task, rng) ?? t.problem
        return [ev('TaskSolved', now, { id: a.id, solved, problem: next })]
      }
      const fresh = generateProblem(a.task, rng) ?? t.problem
      return [ev('TaskFailed', now, { id: a.id, failures: t.failures + 1, problem: fresh })]
    }

    case 'UpdateSettings': {
      const settings = { ...state.settings, ...cmd.patch }
      if (JSON.stringify(settings) === JSON.stringify(state.settings)) return []
      return [ev('SettingsChanged', now, { settings })]
    }

    case 'AddSound':
      return [ev('SoundImported', now, { sound: cmd.sound })]

    case 'RemoveSound':
      return state.sounds.some((s) => s.id === cmd.id) ? [ev('SoundRemoved', now, { id: cmd.id })] : []

    case 'SetTimerDuration': {
      const durationMs = Math.max(1000, Math.round(cmd.durationMs / 1000) * 1000)
      if (durationMs === timer.durationMs) return []
      return [ev('TimerChanged', now, { timer: { ...timer, durationMs } })]
    }

    case 'SetTimerLabel':
      return cmd.label === timer.label ? [] : [ev('TimerChanged', now, { timer: { ...timer, label: cmd.label.slice(0, 60) } })]

    case 'SetTimerSound':
      return [ev('TimerChanged', now, { timer: { ...timer, sound: cmd.sound } })]

    case 'StartTimer': {
      const durationMs = Math.max(1000, cmd.durationMs ?? timer.durationMs)
      return [ev('TimerChanged', now, { timer: startTimer(timer, durationMs, cmd.label ?? timer.label, now) })]
    }

    case 'PauseTimer':
      if (timer.status !== 'running' || timer.endsAt === null) return []
      return [
        ev('TimerChanged', now, {
          timer: { ...timer, status: 'paused', remainingMs: Math.max(0, timer.endsAt - now), endsAt: null },
        }),
      ]

    case 'ResumeTimer':
      if (timer.status !== 'paused') return []
      return [ev('TimerChanged', now, { timer: { ...timer, status: 'running', endsAt: now + timer.remainingMs } })]

    case 'CancelTimer':
      if (timer.status === 'idle') return []
      return [ev('TimerChanged', now, { timer: { ...timer, status: 'idle', endsAt: null, remainingMs: 0 } })]

    case 'StopTimerAlert':
      if (timer.status !== 'ringing') return []
      return [ev('TimerChanged', now, { timer: { ...timer, status: 'idle', endsAt: null, remainingMs: 0 } })]

    case 'RepeatTimer':
      return [ev('TimerChanged', now, { timer: startTimer(timer, timer.durationMs, timer.label, now) })]

    case 'RemoveRecent':
      return timer.recents.some((r) => r.durationMs === cmd.durationMs)
        ? [ev('RecentRemoved', now, { durationMs: cmd.durationMs })]
        : []

    case 'StopwatchStart':
      return sw.startedAt === null ? [ev('StopwatchChanged', now, { stopwatch: { ...sw, startedAt: now } })] : []

    case 'StopwatchStop':
      if (sw.startedAt === null) return []
      return [
        ev('StopwatchChanged', now, {
          stopwatch: { ...sw, accumulatedMs: sw.accumulatedMs + Math.max(0, now - sw.startedAt), startedAt: null },
        }),
      ]

    case 'StopwatchLap':
      if (sw.startedAt === null) return []
      return [
        ev('StopwatchChanged', now, {
          stopwatch: { ...sw, laps: [...sw.laps, sw.accumulatedMs + Math.max(0, now - sw.startedAt)] },
        }),
      ]

    case 'StopwatchReset':
      if (sw.startedAt === null && sw.accumulatedMs === 0 && sw.laps.length === 0) return []
      return [ev('StopwatchChanged', now, { stopwatch: { startedAt: null, accumulatedMs: 0, laps: [] } })]
  }
  return []
}

/**
 * One scheduler pass (§3.4, §3.10): at most one decision per alarm, plus the timer.
 * @param {State} state
 * @param {number} now
 * @returns {JournalEvent[]}
 */
export function decideTick(state, now) {
  /** @type {JournalEvent[]} */
  const out = []
  const graceMs = state.settings.missedGraceMinutes * 60_000
  for (const a of state.alarms) {
    const v = evaluate(a, now, graceMs)
    if (v.kind === 'wait') {
      // Repair: an enabled alarm must always have a next trigger.
      if (a.enabled && a.nextTriggerAt === null && a.snoozeUntil === null && a.ringingSince === null) {
        out.push(ev('AlarmEnabledChanged', now, { id: a.id, enabled: true, nextTriggerAt: nextOccurrence(a, now) }))
      }
      continue
    }
    const schedule =
      v.source === 'schedule' ? advanceAfterTrigger(a, v.trigger, now) : { enabled: a.enabled, nextTriggerAt: a.nextTriggerAt }
    out.push(
      ev(v.kind === 'ring' ? 'AlarmRang' : 'AlarmMissed', now, { id: a.id, source: v.source, trigger: v.trigger, ...schedule }),
    )
  }

  const t = state.timer
  if (t.status === 'running' && t.endsAt !== null && now >= t.endsAt) {
    if (now - t.endsAt > TIMER_LATE_LIMIT_MS) {
      out.push(ev('TimerMissed', now, { timer: { ...t, status: 'idle', endsAt: null, remainingMs: 0 } }))
    } else {
      out.push(ev('TimerRang', now, { timer: { ...t, status: 'ringing', endsAt: null, remainingMs: 0 } }))
    }
  }
  return out
}
