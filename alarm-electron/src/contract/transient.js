/**
 * Transient messages: never written to the journal.
 * `engine` produces them after an event has been stored, or relays them (preview).
 */

import { message } from './commands.js'

/** @typedef {import('./commands.js').SoundRef} SoundRef */
/** @typedef {import('./events.js').Alarm} Alarm */
/** @typedef {import('./events.js').Settings} Settings */
/** @typedef {import('./events.js').Timer} Timer */
/** @typedef {import('./events.js').Stopwatch} Stopwatch */
/** @typedef {import('./events.js').CustomSound} CustomSound */

/** @typedef {{ kind: 'math' | 'retype', prompt: string, solved: number, total: number, failures: number, round: number }} TaskView */
/** @typedef {{ requestId: string, status: 'adding' | 'done' | 'error', error: string | null, soundId: string | null }} SoundImportView */
/**
 * @typedef {object} Projection
 * @property {Alarm[]} alarms sorted by time of day, then creation
 * @property {Settings} settings
 * @property {Timer} timer
 * @property {Stopwatch} stopwatch
 * @property {CustomSound[]} sounds sorted by name
 * @property {Record<string, TaskView>} tasks issued dismissal tasks by alarm id (no answers)
 * @property {{ hourCycle: '12h' | '24h', platform: string, version: string, notifications: 'default' | 'granted' | 'denied' }} system
 * @property {SoundImportView | null} soundImport
 * @property {boolean} previewing
 * @property {number | null} nextRingAt
 * @property {number} clockOffsetMs engine clock minus wall clock (non-zero only with the test clock)
 */

/**
 * @typedef {{ type: 'StateProjected', state: Projection }
 *   | { type: 'NotificationRequested', tag: string, kind: 'alarm' | 'missed' | 'timer' | 'timer-missed', title: string, body: string, snooze: { alarmId: string, label: string } | null }
 *   | { type: 'NotificationClosed', tag: string }
 *   | { type: 'PlaySound', key: string, sound: SoundRef, url: string | null, volume: number, rampSeconds: number, loop: boolean }
 *   | { type: 'StopSound', key: string, fadeMs: number }
 *   | { type: 'PreviewPlay', sound: SoundRef, url: string | null, volume: number, rampSeconds: number, loop: boolean }
 *   | { type: 'PreviewStop' }
 *   | { type: 'ProbeSound', probeId: string, url: string }
 *   | { type: 'ProbeResult', probeId: string, ok: boolean }
 *   | { type: 'KeepAwakeChanged', on: boolean }
 *   | { type: 'RingingChanged', ringing: string[], title: string | null, snoozeAlarmId: string | null, tray: { tooltip: string, open: string, quit: string, snooze: string | null } }
 *   | { type: 'TimerAlertChanged', ringing: boolean, title: string | null }
 * } Transient
 */

const ref = (/** @type {string} */ name) => ({ $ref: `defs#/$defs/${name}` })
const nullableString = { anyOf: [{ type: 'string', maxLength: 300 }, { type: 'null' }] }
const play = {
  sound: ref('SoundRef'),
  url: nullableString,
  volume: { type: 'number', minimum: 0, maximum: 1 },
  rampSeconds: { type: 'number', minimum: 0, maximum: 600 },
  loop: { type: 'boolean' },
}

const projection = {
  type: 'object',
  required: [
    'alarms',
    'settings',
    'timer',
    'stopwatch',
    'sounds',
    'tasks',
    'system',
    'soundImport',
    'previewing',
    'nextRingAt',
    'clockOffsetMs',
  ],
  additionalProperties: false,
  properties: {
    alarms: { type: 'array', items: ref('Alarm') },
    settings: ref('Settings'),
    timer: ref('Timer'),
    stopwatch: ref('Stopwatch'),
    sounds: { type: 'array', items: ref('CustomSound') },
    tasks: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        required: ['kind', 'prompt', 'solved', 'total', 'failures', 'round'],
        additionalProperties: false,
        properties: {
          kind: { enum: ['math', 'retype'] },
          prompt: { type: 'string' },
          solved: { type: 'integer', minimum: 0 },
          total: { type: 'integer', minimum: 1 },
          failures: { type: 'integer', minimum: 0 },
          round: { type: 'integer', minimum: 1 },
        },
      },
    },
    system: {
      type: 'object',
      required: ['hourCycle', 'platform', 'version', 'notifications'],
      additionalProperties: false,
      properties: {
        hourCycle: { enum: ['12h', '24h'] },
        platform: { type: 'string' },
        version: { type: 'string' },
        notifications: { enum: ['default', 'granted', 'denied'] },
      },
    },
    soundImport: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['requestId', 'status', 'error', 'soundId'],
          additionalProperties: false,
          properties: {
            requestId: { type: 'string' },
            status: { enum: ['adding', 'done', 'error'] },
            error: nullableString,
            soundId: nullableString,
          },
        },
      ],
    },
    previewing: { type: 'boolean' },
    nextRingAt: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    clockOffsetMs: { type: 'number' },
  },
}

export const transientSchemas = [
  message('StateProjected', { state: projection }),
  message('NotificationRequested', {
    tag: { type: 'string', maxLength: 100 },
    kind: { enum: ['alarm', 'missed', 'timer', 'timer-missed'] },
    title: { type: 'string', maxLength: 200 },
    body: { type: 'string', maxLength: 500 },
    snooze: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['alarmId', 'label'],
          additionalProperties: false,
          properties: { alarmId: ref('Id'), label: { type: 'string', maxLength: 60 } },
        },
      ],
    },
  }),
  message('NotificationClosed', { tag: { type: 'string', maxLength: 100 } }),
  message('PlaySound', { key: { type: 'string', maxLength: 100 }, ...play }),
  message('StopSound', { key: { type: 'string', maxLength: 100 }, fadeMs: { type: 'number', minimum: 0, maximum: 5000 } }),
  message('PreviewPlay', play),
  message('PreviewStop'),
  message('ProbeSound', { probeId: ref('Id'), url: { type: 'string', maxLength: 300 } }),
  message('ProbeResult', { probeId: ref('Id'), ok: { type: 'boolean' } }),
  message('KeepAwakeChanged', { on: { type: 'boolean' } }),
  message('RingingChanged', {
    ringing: { type: 'array', items: ref('Id') },
    title: nullableString,
    snoozeAlarmId: nullableString,
    tray: {
      type: 'object',
      required: ['tooltip', 'open', 'quit', 'snooze'],
      additionalProperties: false,
      properties: {
        tooltip: { type: 'string' },
        open: { type: 'string' },
        quit: { type: 'string' },
        snooze: nullableString,
      },
    },
  }),
  message('TimerAlertChanged', { ringing: { type: 'boolean' }, title: nullableString }),
]

export const TRANSIENT_TYPES = transientSchemas.map((s) => s.$id)
