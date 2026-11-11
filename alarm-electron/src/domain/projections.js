/**
 * Projections of the engine state into what other processes need:
 * the UI snapshot, the set of sounds that must be playing, tray/window state,
 * keep-awake, and notification texts for new events. Pure.
 */

import { mediaUrl } from '../contract/channels.js'
import { DEFAULT_SOUND } from './defaults.js'
import { formatClockString, formatCountdown } from './format.js'
import { MISSED_NOTIFY_LIMIT_MS, nextUpcoming } from './schedule.js'
import { ALARM_FADE_MS, FADE_MS, TIMER_RAMP_SECONDS, TIMER_VOLUME } from './ramp.js'
import { alarmLabel, N, S, timerLabel } from './strings.js'

/** @typedef {import('./defaults.js').State} State */
/** @typedef {import('../contract/transient.js').Projection} Projection */
/** @typedef {import('../contract/transient.js').SoundImportView} SoundImportView */
/** @typedef {import('../contract/events.js').JournalEvent} JournalEvent */
/** @typedef {import('../contract/commands.js').SoundRef} SoundRef */
/** @typedef {import('./format.js').HourCycle} HourCycle */

/**
 * Engine runtime facts that are not journaled.
 * @typedef {object} Runtime
 * @property {{ hourCycle: HourCycle, platform: string, version: string, notifications: 'default' | 'granted' | 'denied' }} system
 * @property {SoundImportView | null} soundImport
 * @property {boolean} previewing
 * @property {number} clockOffsetMs
 */

/** @param {State} s @returns {HourCycle} */
export const hourCycleOf = (s, /** @type {HourCycle} */ system) =>
  s.settings.hourCycle === 'auto' ? system : s.settings.hourCycle

/**
 * @param {State} s
 * @param {Runtime} rt
 * @returns {Projection}
 */
export function project(s, rt) {
  /** @type {Projection['tasks']} */
  const tasks = {}
  for (const a of s.alarms) {
    const t = s.tasks[a.id]
    if (t && a.ringingSince !== null) {
      tasks[a.id] = {
        kind: t.problem.kind,
        prompt: t.problem.prompt,
        solved: t.solved,
        total: a.task.count,
        failures: t.failures,
        round: t.round,
      }
    }
  }
  return {
    alarms: s.alarms,
    settings: s.settings,
    timer: s.timer,
    stopwatch: s.stopwatch,
    sounds: s.sounds,
    tasks,
    system: rt.system,
    soundImport: rt.soundImport,
    previewing: rt.previewing,
    nextRingAt: nextUpcoming(s.alarms)?.at ?? null,
    clockOffsetMs: rt.clockOffsetMs,
  }
}

/**
 * Resolves a sound reference to what the audio process plays: built-in id or file URL.
 * A custom sound that is no longer in the library falls back to Sunrise (§3.8).
 * @param {State} s
 * @param {SoundRef} ref
 * @returns {{ sound: SoundRef, url: string | null }}
 */
export function resolveSound(s, ref) {
  if (ref.kind === 'builtin') return { sound: ref, url: null }
  const file = s.sounds.find((x) => x.id === ref.id)
  return file ? { sound: ref, url: mediaUrl(file.id, file.ext) } : { sound: DEFAULT_SOUND, url: null }
}

/**
 * Every sound that must be playing now, by key. The engine diffs this against what it last sent.
 * @param {State} s
 * @returns {Map<string, { sound: SoundRef, url: string | null, volume: number, rampSeconds: number, loop: boolean }>}
 */
export function soundPlan(s) {
  const plan = new Map()
  for (const a of s.alarms) {
    if (a.ringingSince === null) continue
    plan.set(`alarm:${a.id}`, { ...resolveSound(s, a.sound), volume: a.volume, rampSeconds: a.rampSeconds, loop: true })
  }
  if (s.timer.status === 'ringing') {
    plan.set('timer', { ...resolveSound(s, s.timer.sound), volume: TIMER_VOLUME, rampSeconds: TIMER_RAMP_SECONDS, loop: true })
  }
  return plan
}

/** Fade used when a sound with this key stops. @param {string} key */
export const fadeFor = (key) => (key.startsWith('alarm:') ? ALARM_FADE_MS : FADE_MS)

/**
 * Keep the computer awake: setting on and an enabled, snoozed or ringing alarm exists (TZ §3.7).
 * @param {State} s
 */
export const keepAwake = (s) =>
  s.settings.keepAwake && s.alarms.some((a) => a.enabled || a.snoozeUntil !== null || a.ringingSince !== null)

/**
 * Tray menu and window title while alarms ring (TZ §3.13, ALARM_SPEC §3.5).
 * @param {State} s
 */
export function ringingInfo(s) {
  const ringing = s.alarms.filter((a) => a.ringingSince !== null)
  const first = ringing[0]
  const snoozable = first && first.snooze ? first : null
  return {
    ringing: ringing.map((a) => a.id),
    title: first ? N.alarmTitle(alarmLabel(first)) : null,
    snoozeAlarmId: snoozable ? snoozable.id : null,
    tray: {
      tooltip: S.appName,
      open: S.trayOpen,
      quit: S.trayQuit,
      snooze: snoozable ? S.traySnooze(s.settings.snoozeMinutes) : null,
    },
  }
}

/** @param {State} s */
export const timerAlert = (s) => ({
  ringing: s.timer.status === 'ringing',
  title: s.timer.status === 'ringing' ? timerLabel(s.timer) : null,
})

export const alarmTag = (/** @type {string} */ id) => `alarm-${id}`
export const TIMER_TAG = 'timer'

/**
 * @typedef {{ type: 'NotificationRequested', tag: string, kind: 'alarm' | 'missed' | 'timer' | 'timer-missed', title: string, body: string, snooze: { alarmId: string, label: string } | null }
 *   | { type: 'NotificationClosed', tag: string }} NotificationMsg
 */

/**
 * Alarm notification for a ringing alarm (§3.4 step 4).
 * @param {State} s
 * @param {import('../contract/events.js').Alarm} a
 * @param {HourCycle} cycle
 * @returns {NotificationMsg}
 */
export function alarmNotification(s, a, cycle) {
  return {
    type: 'NotificationRequested',
    tag: alarmTag(a.id),
    kind: 'alarm',
    title: N.alarmTitle(alarmLabel(a)),
    body: N.alarmBody(formatClockString(a.hour, a.minute, cycle)),
    snooze: a.snooze ? { alarmId: a.id, label: N.snoozeAction(s.settings.snoozeMinutes) } : null,
  }
}

/**
 * Notifications caused by newly stored events.
 * @param {readonly JournalEvent[]} events
 * @param {State} before
 * @param {State} after
 * @param {HourCycle} cycle
 * @returns {NotificationMsg[]}
 */
export function notificationsFor(events, before, after, cycle) {
  /** @type {NotificationMsg[]} */
  const out = []
  for (const e of events) {
    switch (e.type) {
      case 'AlarmRang': {
        const a = after.alarms.find((x) => x.id === e.id)
        if (a) out.push(alarmNotification(after, a, cycle))
        break
      }
      case 'AlarmMissed': {
        const a = after.alarms.find((x) => x.id === e.id)
        if (a && e.at - e.trigger < MISSED_NOTIFY_LIMIT_MS) {
          const d = new Date(e.trigger)
          out.push({
            type: 'NotificationRequested',
            tag: alarmTag(a.id),
            kind: 'missed',
            title: N.missedTitle(alarmLabel(a)),
            body: N.missedBody(formatClockString(d.getHours(), d.getMinutes(), cycle)),
            snooze: null,
          })
        }
        break
      }
      case 'AlarmSnoozed':
      case 'AlarmDismissed':
      case 'AlarmDeleted':
        out.push({ type: 'NotificationClosed', tag: alarmTag(e.id) })
        break
      case 'AlarmSaved':
        if (before.alarms.some((x) => x.id === e.alarm.id && x.ringingSince !== null)) {
          out.push({ type: 'NotificationClosed', tag: alarmTag(e.alarm.id) })
        }
        break
      case 'TimerRang':
        out.push({
          type: 'NotificationRequested',
          tag: TIMER_TAG,
          kind: 'timer',
          title: N.timerTitle(timerLabel(e.timer)),
          body: N.timerBody(formatCountdown(e.timer.durationMs)),
          snooze: null,
        })
        break
      case 'TimerMissed':
        out.push({
          type: 'NotificationRequested',
          tag: TIMER_TAG,
          kind: 'timer-missed',
          title: N.timerMissedTitle(timerLabel(e.timer)),
          body: N.timerMissedBody(formatCountdown(e.timer.durationMs)),
          snooze: null,
        })
        break
      case 'TimerChanged':
        if (before.timer.status === 'ringing' && e.timer.status !== 'ringing')
          out.push({ type: 'NotificationClosed', tag: TIMER_TAG })
        break
    }
  }
  return out
}
