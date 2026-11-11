/**
 * Commands sent to `engine` (from `ui` and `shell`) and system signals from `shell`.
 * Each message is `{ type, ...payload }` and has a JSON Schema below.
 */

/** @typedef {{ kind: 'builtin' | 'custom', id: string }} SoundRef */
/** @typedef {'none' | 'math' | 'retype'} TaskType */
/** @typedef {'easy' | 'medium' | 'hard'} Difficulty */
/** @typedef {{ type: TaskType, difficulty: Difficulty, count: number }} Task */
/**
 * @typedef {object} AlarmDraft
 * @property {string} id empty string for a new alarm
 * @property {number} hour
 * @property {number} minute
 * @property {string} label
 * @property {number[]} days
 * @property {SoundRef} sound
 * @property {number} volume
 * @property {number} rampSeconds
 * @property {boolean} snooze
 * @property {Task} task
 */
/**
 * @typedef {object} SettingsPatch
 * @property {'system' | 'light' | 'dark'} [theme]
 * @property {'auto' | '12h' | '24h'} [hourCycle]
 * @property {number} [snoozeMinutes]
 * @property {number} [rampSeconds]
 * @property {number} [volume]
 * @property {SoundRef} [defaultSound]
 * @property {Task} [defaultTask]
 * @property {boolean} [keepAwake]
 * @property {number} [missedGraceMinutes]
 * @property {boolean} [openAtLogin]
 */

/**
 * @typedef {{ type: 'SaveAlarm', alarm: AlarmDraft }
 *   | { type: 'DeleteAlarm', id: string }
 *   | { type: 'SetAlarmEnabled', id: string, enabled: boolean }
 *   | { type: 'CancelSnooze', id: string }
 *   | { type: 'Snooze', id: string }
 *   | { type: 'Stop', id: string }
 *   | { type: 'SubmitAnswer', id: string, answer: string }
 *   | { type: 'UpdateSettings', patch: SettingsPatch }
 *   | { type: 'ImportSound', requestId: string, path: string, name: string, size: number }
 *   | { type: 'RemoveSound', id: string }
 *   | { type: 'SetTimerDuration', durationMs: number }
 *   | { type: 'SetTimerLabel', label: string }
 *   | { type: 'SetTimerSound', sound: SoundRef }
 *   | { type: 'StartTimer', durationMs?: number, label?: string }
 *   | { type: 'PauseTimer' } | { type: 'ResumeTimer' } | { type: 'CancelTimer' }
 *   | { type: 'StopTimerAlert' } | { type: 'RepeatTimer' }
 *   | { type: 'RemoveRecent', durationMs: number }
 *   | { type: 'StopwatchStart' } | { type: 'StopwatchStop' } | { type: 'StopwatchLap' } | { type: 'StopwatchReset' }
 * } Command
 */

/**
 * @typedef {{ type: 'WindowFocused' }
 *   | { type: 'SystemInfo', hourCycle: '12h' | '24h', locale: string, platform: string, version: string }
 *   | { type: 'NotificationPermission', state: 'default' | 'granted' | 'denied' }
 * } SystemSignal
 */

/** Stage-1 health check and test-only clock control (accepted by `engine` only with the test flag). */
/** @typedef {{ type: 'Ping', from: string, seq: number } | { type: 'Pong', from: string, seq: number } | { type: 'TestSetClock', now: number }} Service */

const ref = (/** @type {string} */ name) => ({ $ref: `defs#/$defs/${name}` })
const id = ref('Id')

/**
 * @param {string} type
 * @param {Record<string, object>} [props]
 * @param {string[]} [optional]
 */
export function message(type, props = {}, optional = []) {
  return {
    $id: type,
    type: 'object',
    required: ['type', ...Object.keys(props).filter((k) => !optional.includes(k))],
    additionalProperties: false,
    properties: { type: { const: type }, ...props },
  }
}

export const commandSchemas = [
  message('SaveAlarm', { alarm: ref('AlarmDraft') }),
  message('DeleteAlarm', { id }),
  message('SetAlarmEnabled', { id, enabled: { type: 'boolean' } }),
  message('CancelSnooze', { id }),
  message('Snooze', { id }),
  message('Stop', { id }),
  message('SubmitAnswer', { id, answer: { type: 'string', maxLength: 100 } }),
  message('UpdateSettings', { patch: ref('SettingsPatch') }),
  message('ImportSound', {
    requestId: id,
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    name: { type: 'string', maxLength: 255 },
    size: { type: 'number', minimum: 0 },
  }),
  message('RemoveSound', { id }),
  message('SetTimerDuration', { durationMs: { type: 'number', minimum: 1000, maximum: 86_399_000 } }),
  message('SetTimerLabel', { label: ref('Label') }),
  message('SetTimerSound', { sound: ref('SoundRef') }),
  message('StartTimer', { durationMs: { type: 'number', minimum: 1000, maximum: 86_399_000 }, label: ref('Label') }, [
    'durationMs',
    'label',
  ]),
  message('PauseTimer'),
  message('ResumeTimer'),
  message('CancelTimer'),
  message('StopTimerAlert'),
  message('RepeatTimer'),
  message('RemoveRecent', { durationMs: { type: 'number' } }),
  message('StopwatchStart'),
  message('StopwatchStop'),
  message('StopwatchLap'),
  message('StopwatchReset'),
]

export const systemSchemas = [
  message('WindowFocused'),
  message('SystemInfo', {
    hourCycle: { enum: ['12h', '24h'] },
    locale: { type: 'string', maxLength: 64 },
    platform: { type: 'string', maxLength: 32 },
    version: { type: 'string', maxLength: 32 },
  }),
  message('NotificationPermission', { state: { enum: ['default', 'granted', 'denied'] } }),
]

export const serviceSchemas = [
  message('Ping', { from: { type: 'string', maxLength: 16 }, seq: { type: 'integer' } }),
  message('Pong', { from: { type: 'string', maxLength: 16 }, seq: { type: 'integer' } }),
  message('TestSetClock', { now: { type: 'number' } }),
]

export const COMMAND_TYPES = commandSchemas.map((s) => s.$id)
export const SYSTEM_TYPES = systemSchemas.map((s) => s.$id)
