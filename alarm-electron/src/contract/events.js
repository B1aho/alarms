/**
 * Journal events. Every event carries `v` (schema version) and `at` (ms epoch).
 * Older versions are brought up to date by `domain/upcast.js`.
 */

import { message } from './commands.js'

/** Current schema version of every journal event. */
export const EVENT_VERSION = 1

/** @typedef {import('./commands.js').SoundRef} SoundRef */
/** @typedef {import('./commands.js').Task} Task */

/**
 * @typedef {object} Alarm
 * @property {string} id
 * @property {number} hour
 * @property {number} minute
 * @property {string} label
 * @property {boolean} enabled
 * @property {number[]} days
 * @property {SoundRef} sound
 * @property {number} volume
 * @property {number} rampSeconds
 * @property {boolean} snooze
 * @property {Task} task
 * @property {number} createdAt
 * @property {number | null} nextTriggerAt
 * @property {number | null} snoozeUntil
 * @property {number | null} ringingSince
 */

/**
 * @typedef {object} Settings
 * @property {'system' | 'light' | 'dark'} theme
 * @property {'auto' | '12h' | '24h'} hourCycle
 * @property {number} snoozeMinutes
 * @property {number} rampSeconds
 * @property {number} volume
 * @property {SoundRef} defaultSound
 * @property {Task} defaultTask
 * @property {boolean} keepAwake
 * @property {number} missedGraceMinutes
 * @property {boolean} openAtLogin
 */

/**
 * @typedef {object} Timer
 * @property {'idle' | 'running' | 'paused' | 'ringing'} status
 * @property {number} durationMs
 * @property {number | null} endsAt
 * @property {number} remainingMs
 * @property {string} label
 * @property {SoundRef} sound
 * @property {Array<{ durationMs: number, label: string }>} recents
 */

/** @typedef {{ startedAt: number | null, accumulatedMs: number, laps: number[] }} Stopwatch */
/** @typedef {{ id: string, name: string, size: number, addedAt: number, ext: string }} CustomSound */
/** @typedef {{ kind: 'math' | 'retype', prompt: string, answer: string }} Problem */
/** @typedef {'schedule' | 'snooze'} Source */

/**
 * @typedef {{ v: number, at: number }} Meta
 * @typedef {Meta & (
 *     { type: 'AlarmSaved', alarm: Alarm }
 *   | { type: 'AlarmDeleted', id: string }
 *   | { type: 'AlarmEnabledChanged', id: string, enabled: boolean, nextTriggerAt: number | null }
 *   | { type: 'AlarmRang', id: string, source: Source, trigger: number, enabled: boolean, nextTriggerAt: number | null }
 *   | { type: 'AlarmMissed', id: string, source: Source, trigger: number, enabled: boolean, nextTriggerAt: number | null }
 *   | { type: 'AlarmSnoozed', id: string, until: number }
 *   | { type: 'SnoozeCancelled', id: string }
 *   | { type: 'AlarmDismissed', id: string }
 *   | { type: 'TaskIssued', id: string, round: number, problem: Problem }
 *   | { type: 'TaskSolved', id: string, solved: number, problem: Problem | null }
 *   | { type: 'TaskFailed', id: string, failures: number, problem: Problem }
 *   | { type: 'SettingsChanged', settings: Settings }
 *   | { type: 'SoundImported', sound: CustomSound }
 *   | { type: 'SoundRemoved', id: string }
 *   | { type: 'TimerChanged', timer: Timer }
 *   | { type: 'TimerRang', timer: Timer }
 *   | { type: 'TimerMissed', timer: Timer }
 *   | { type: 'RecentRemoved', durationMs: number }
 *   | { type: 'StopwatchChanged', stopwatch: Stopwatch }
 * )} JournalEvent
 */

const ref = (/** @type {string} */ name) => ({ $ref: `defs#/$defs/${name}` })
const id = ref('Id')
const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] }

/**
 * @param {string} type
 * @param {Record<string, object>} [props]
 */
const event = (type, props = {}) => message(type, { v: { type: 'integer', minimum: 1 }, at: { type: 'number' }, ...props })

const schedule = {
  id,
  source: ref('Source'),
  trigger: { type: 'number' },
  enabled: { type: 'boolean' },
  nextTriggerAt: nullableNumber,
}

export const eventSchemas = [
  event('AlarmSaved', { alarm: ref('Alarm') }),
  event('AlarmDeleted', { id }),
  event('AlarmEnabledChanged', { id, enabled: { type: 'boolean' }, nextTriggerAt: nullableNumber }),
  event('AlarmRang', schedule),
  event('AlarmMissed', schedule),
  event('AlarmSnoozed', { id, until: { type: 'number' } }),
  event('SnoozeCancelled', { id }),
  event('AlarmDismissed', { id }),
  event('TaskIssued', { id, round: { type: 'integer', minimum: 1 }, problem: ref('Problem') }),
  event('TaskSolved', { id, solved: { type: 'integer', minimum: 0 }, problem: { anyOf: [ref('Problem'), { type: 'null' }] } }),
  event('TaskFailed', { id, failures: { type: 'integer', minimum: 0 }, problem: ref('Problem') }),
  event('SettingsChanged', { settings: ref('Settings') }),
  event('SoundImported', { sound: ref('CustomSound') }),
  event('SoundRemoved', { id }),
  event('TimerChanged', { timer: ref('Timer') }),
  event('TimerRang', { timer: ref('Timer') }),
  event('TimerMissed', { timer: ref('Timer') }),
  event('RecentRemoved', { durationMs: { type: 'number' } }),
  event('StopwatchChanged', { stopwatch: ref('Stopwatch') }),
]

export const EVENT_TYPES = eventSchemas.map((s) => s.$id)
