/**
 * Bus topology: process roles, Electron IPC channel names, and which message
 * types each process accepts. `engine` routes every outgoing message by these
 * lists; every process drops anything it does not accept.
 */

/** @typedef {'shell' | 'ui' | 'audio'} Role */

/** IPC channel names (ipcMain / ipcRenderer). Sandboxed preloads cannot import this file; test/contract checks they match. */
export const IPC = Object.freeze({
  /** main → renderer: transfers the renderer's end of a MessageChannelMain to the engine. */
  busPort: 'bus:port',
  /** ui → main (invoke): system file dialog for a music file. */
  pickSoundFile: 'shell:pick-sound-file',
  /** ui → main (invoke): ask the OS for notification permission. */
  requestNotifications: 'shell:request-notifications',
})

/** Messages between `main` and the `engine` utility process (parentPort). */
export const ENGINE_CONTROL = Object.freeze({
  /** main → engine: `{ kind: 'attach', role, ports: [port] }` */
  attach: 'attach',
})

export const ROLES = /** @type {const} */ (['shell', 'ui', 'audio'])

/** Types `engine` sends to each role. */
export const SUBSCRIPTIONS = Object.freeze({
  ui: Object.freeze(['StateProjected', 'Pong']),
  audio: Object.freeze(['PlaySound', 'StopSound', 'PreviewPlay', 'PreviewStop', 'ProbeSound', 'Pong']),
  shell: Object.freeze([
    'StateProjected',
    'NotificationRequested',
    'NotificationClosed',
    'KeepAwakeChanged',
    'RingingChanged',
    'TimerAlertChanged',
    'Pong',
  ]),
})

/** Types `engine` accepts from each role. */
export const ENGINE_ACCEPTS = Object.freeze({
  ui: Object.freeze([
    'SaveAlarm',
    'DeleteAlarm',
    'SetAlarmEnabled',
    'CancelSnooze',
    'Snooze',
    'Stop',
    'SubmitAnswer',
    'UpdateSettings',
    'ImportSound',
    'RemoveSound',
    'SetTimerDuration',
    'SetTimerLabel',
    'SetTimerSound',
    'StartTimer',
    'PauseTimer',
    'ResumeTimer',
    'CancelTimer',
    'StopTimerAlert',
    'RepeatTimer',
    'RemoveRecent',
    'StopwatchStart',
    'StopwatchStop',
    'StopwatchLap',
    'StopwatchReset',
    'PreviewPlay',
    'PreviewStop',
    'Ping',
  ]),
  audio: Object.freeze(['ProbeResult', 'Ping']),
  shell: Object.freeze([
    'Snooze',
    'StopTimerAlert',
    'WindowFocused',
    'SystemInfo',
    'NotificationPermission',
    'TestSetClock',
    'Ping',
  ]),
})

/** Custom sounds are served to the audio renderer by `shell` from `userData/sounds/` under this scheme. */
export const MEDIA_SCHEME = 'alarm-media'
/** App code (ui, audio and the modules they import) is served from `src/` under this scheme. */
export const APP_SCHEME = 'app'
export const APP_HOST = 'alarm'

/** File name of a stored custom sound: `<id>.<ext>`. */
export const SOUND_FILE_RE = /^[a-z0-9]{1,40}\.[a-z0-9]{1,5}$/

/**
 * @param {string} id
 * @param {string} ext
 */
export const soundFileName = (id, ext) => `${id}.${ext}`

/**
 * @param {string} id
 * @param {string} ext
 */
export const mediaUrl = (id, ext) => `${MEDIA_SCHEME}://sounds/${soundFileName(id, ext)}`

/** Accepted music file extensions (ALARM_SPEC.md §3.8). */
export const MEDIA_EXTENSIONS = Object.freeze(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm'])
