import { MEDIA_EXTENSIONS } from '../contract/channels.js'

/** Default values (ALARM_SPEC.md §2, plus `openAtLogin` from TZ_ELECTRON.md §3.4). */

/** @typedef {import('../contract/events.js').Settings} Settings */
/** @typedef {import('../contract/events.js').Timer} Timer */
/** @typedef {import('../contract/events.js').Stopwatch} Stopwatch */
/** @typedef {import('../contract/events.js').Alarm} Alarm */
/** @typedef {import('../contract/events.js').CustomSound} CustomSound */
/** @typedef {import('../contract/events.js').Problem} Problem */
/** @typedef {import('../contract/commands.js').SoundRef} SoundRef */

/** @typedef {{ problem: Problem, solved: number, failures: number, round: number }} IssuedTask */
/**
 * Engine state: everything the journal rebuilds.
 * @typedef {object} State
 * @property {Alarm[]} alarms sorted by time of day, then creation
 * @property {Settings} settings
 * @property {Timer} timer
 * @property {Stopwatch} stopwatch
 * @property {CustomSound[]} sounds sorted by name
 * @property {Record<string, IssuedTask>} tasks
 */

/** @type {SoundRef} */
export const DEFAULT_SOUND = Object.freeze({ kind: 'builtin', id: 'sunrise' })
/** @type {SoundRef} */
export const DEFAULT_TIMER_SOUND = Object.freeze({ kind: 'builtin', id: 'chimes' })

export const MAX_SOUND_BYTES = 80 * 1024 * 1024
export const AUDIO_EXTENSIONS = MEDIA_EXTENSIONS

/** @returns {Settings} */
export const defaultSettings = () => ({
  theme: 'system',
  hourCycle: 'auto',
  snoozeMinutes: 9,
  rampSeconds: 60,
  volume: 0.9,
  defaultSound: { ...DEFAULT_SOUND },
  defaultTask: { type: 'math', difficulty: 'medium', count: 2 },
  keepAwake: false,
  missedGraceMinutes: 60,
  openAtLogin: true,
})

/** @returns {Timer} */
export const initialTimer = () => ({
  status: 'idle',
  durationMs: 5 * 60_000,
  endsAt: null,
  remainingMs: 0,
  label: '',
  sound: { ...DEFAULT_TIMER_SOUND },
  recents: [],
})

/** @returns {Stopwatch} */
export const initialStopwatch = () => ({ startedAt: null, accumulatedMs: 0, laps: [] })

/** @returns {State} */
export const initialState = () => ({
  alarms: [],
  settings: defaultSettings(),
  timer: initialTimer(),
  stopwatch: initialStopwatch(),
  sounds: [],
  tasks: {},
})
