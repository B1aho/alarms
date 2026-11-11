/**
 * evolve(state, event) → state. Pure and idempotent per event: every event carries
 * absolute values, so replaying an event twice (e.g. after an interrupted compaction) is harmless.
 */

import { byTime } from './schedule.js'

/** @typedef {import('./defaults.js').State} State */
/** @typedef {import('../contract/events.js').JournalEvent} JournalEvent */
/** @typedef {import('../contract/events.js').Alarm} Alarm */

/**
 * @param {State} s
 * @param {string} id
 * @param {(a: Alarm) => Alarm} fn
 * @returns {State}
 */
function patchAlarm(s, id, fn) {
  if (!s.alarms.some((a) => a.id === id)) return s
  return { ...s, alarms: s.alarms.map((a) => (a.id === id ? fn(a) : a)).sort(byTime) }
}

/**
 * @param {Record<string, import('./defaults.js').IssuedTask>} tasks
 * @param {string} id
 */
function withoutTask(tasks, id) {
  if (!(id in tasks)) return tasks
  const { [id]: _removed, ...rest } = tasks
  return rest
}

/**
 * @param {State} s
 * @param {JournalEvent} e
 * @returns {State}
 */
export function evolve(s, e) {
  switch (e.type) {
    case 'AlarmSaved': {
      const alarms = [...s.alarms.filter((a) => a.id !== e.alarm.id), e.alarm].sort(byTime)
      return { ...s, alarms, tasks: withoutTask(s.tasks, e.alarm.id) }
    }
    case 'AlarmDeleted':
      return { ...s, alarms: s.alarms.filter((a) => a.id !== e.id), tasks: withoutTask(s.tasks, e.id) }
    case 'AlarmEnabledChanged':
      return patchAlarm(s, e.id, (a) => ({ ...a, enabled: e.enabled, nextTriggerAt: e.nextTriggerAt, snoozeUntil: null }))
    case 'AlarmRang':
      return patchAlarm(s, e.id, (a) => ({
        ...a,
        enabled: e.enabled,
        nextTriggerAt: e.nextTriggerAt,
        snoozeUntil: null,
        ringingSince: e.at,
      }))
    case 'AlarmMissed':
      return patchAlarm(s, e.id, (a) => ({ ...a, enabled: e.enabled, nextTriggerAt: e.nextTriggerAt, snoozeUntil: null }))
    case 'AlarmSnoozed': {
      const next = patchAlarm(s, e.id, (a) => ({ ...a, ringingSince: null, snoozeUntil: e.until }))
      return { ...next, tasks: withoutTask(next.tasks, e.id) }
    }
    case 'SnoozeCancelled':
      return patchAlarm(s, e.id, (a) => ({ ...a, snoozeUntil: null }))
    case 'AlarmDismissed': {
      const next = patchAlarm(s, e.id, (a) => ({ ...a, ringingSince: null, snoozeUntil: null }))
      return { ...next, tasks: withoutTask(next.tasks, e.id) }
    }
    case 'TaskIssued':
      return { ...s, tasks: { ...s.tasks, [e.id]: { problem: e.problem, solved: 0, failures: 0, round: e.round } } }
    case 'TaskSolved': {
      const t = s.tasks[e.id]
      if (!t) return s
      if (!e.problem) return { ...s, tasks: withoutTask(s.tasks, e.id) }
      return { ...s, tasks: { ...s.tasks, [e.id]: { ...t, problem: e.problem, solved: e.solved } } }
    }
    case 'TaskFailed': {
      const t = s.tasks[e.id]
      if (!t) return s
      return { ...s, tasks: { ...s.tasks, [e.id]: { ...t, problem: e.problem, failures: e.failures } } }
    }
    case 'SettingsChanged':
      return { ...s, settings: e.settings }
    case 'SoundImported':
      return {
        ...s,
        sounds: [...s.sounds.filter((x) => x.id !== e.sound.id), e.sound].sort((a, b) => a.name.localeCompare(b.name)),
      }
    case 'SoundRemoved':
      return { ...s, sounds: s.sounds.filter((x) => x.id !== e.id) }
    case 'TimerChanged':
    case 'TimerRang':
    case 'TimerMissed':
      return { ...s, timer: e.timer }
    case 'RecentRemoved':
      return { ...s, timer: { ...s.timer, recents: s.timer.recents.filter((r) => r.durationMs !== e.durationMs) } }
    case 'StopwatchChanged':
      return { ...s, stopwatch: e.stopwatch }
  }
  return s
}

/**
 * @param {State} s
 * @param {readonly JournalEvent[]} events
 */
export const evolveAll = (s, events) => events.reduce(evolve, s)
