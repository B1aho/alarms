/**
 * Every user-visible text: window, tray and notifications (ALARM_SPEC.md §6, TZ_ELECTRON.md §3).
 * Nothing else in the app spells out English text.
 */

export const APP_NAME = 'Alarm'
export const DEFAULT_ALARM_LABEL = 'Alarm'
export const DEFAULT_TIMER_LABEL = 'Timer'

export const BUILTIN_SOUNDS = /** @type {const} */ ([
  { id: 'sunrise', name: 'Sunrise' },
  { id: 'harp', name: 'Harp' },
  { id: 'chimes', name: 'Chimes' },
  { id: 'beacon', name: 'Beacon' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'classic', name: 'Classic Bell' },
])

export const S = Object.freeze({
  // navigation & page titles
  appName: APP_NAME,
  tabs: { alarms: 'Alarms', stopwatch: 'Stopwatch', timer: 'Timer', settings: 'Settings' },
  currentTime: 'Current time',
  sections: 'Sections',

  // alarms list
  edit: 'Edit',
  done: 'Done',
  noAlarmsOn: 'No alarms on',
  /** @param {string} rel */
  nextAlarmIn: (rel) => `Next alarm in ${rel}`,
  alarmsHeader: 'ALARMS',
  noAlarms: 'No Alarms',
  noAlarmsHint: 'Add an alarm to wake up on time.',
  addAlarm: 'Add Alarm',
  addAlarmAria: 'Add alarm',
  /** @param {string} time */
  snoozedUntil: (time) => `Snoozed until ${time}`,
  stop: 'Stop',
  delete: 'Delete',
  /** @param {string} label */
  deleteAria: (label) => `Delete ${label}`,

  // banners
  allowNotifications: 'Allow Notifications',
  allowNotificationsHint: 'So alarms reach you even when the app is minimised or behind other windows.',
  turnOn: 'Turn On',
  notificationsBlocked: 'Notifications are blocked',
  /** @param {string} platform */
  notificationsBlockedHint: (platform) =>
    `Alarms still ring while the app is open, but you will not see them when the window is hidden. ${
      platform === 'darwin'
        ? 'Allow notifications in System Settings → Notifications.'
        : platform === 'win32'
          ? 'Allow notifications in Settings → System → Notifications.'
          : 'Allow notifications in your desktop settings.'
    }`,

  // editor
  editAlarm: 'Edit Alarm',
  cancel: 'Cancel',
  save: 'Save',
  back: 'Back',
  repeat: 'Repeat',
  label: 'Label',
  sound: 'Sound',
  snooze: 'Snooze',
  gradualVolume: 'Gradual Volume',
  previewWakeUp: 'Preview Wake-up',
  stopPreview: 'Stop Preview',
  turnOffWith: 'Turn Off With',
  deleteAlarm: 'Delete Alarm',
  volumeHeader: 'VOLUME',
  turnOffHeader: 'TURN OFF',
  difficultyHeader: 'DIFFICULTY',
  exampleHeader: 'EXAMPLE',
  volumeFooter: 'Starts almost silent and rises smoothly to the set volume.',
  rampFooter: 'How long it takes to reach full volume.',
  turnOffFooter: 'The alarm keeps ringing until the task is solved. Snooze never needs a task.',
  alarmVolumeAria: 'Alarm volume',
  hourAria: 'Hour',
  minuteAria: 'Minute',
  periodAria: 'AM or PM',
  taskTypeAria: 'Task type',
  taskCountAria: 'Number of tasks',
  decrease: 'Decrease',
  increase: 'Increase',
  /** @param {string} day */
  everyDay: (day) => `Every ${day}`,
  never: 'Never',
  everyDayAll: 'Every day',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  taskTypes: { none: 'None', math: 'Math', retype: 'Retype Code' },
  taskTypesShort: { none: 'None', math: 'Math', retype: 'Code' },
  difficulties: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  /** @param {number} n */
  tasksInARow: (n) => `${n} ${n === 1 ? 'task' : 'tasks'} in a row`,
  off: 'Off',

  // sounds
  yourMusicHeader: 'YOUR MUSIC',
  chooseFile: 'Choose a File…',
  adding: 'Adding…',
  builtinHeader: 'BUILT-IN SOUNDS',
  missingFile: 'Missing file',
  soundsFooter: 'Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported.',
  notAudio: 'That file is not an audio file.',
  tooLarge: 'That file is larger than 80 MB.',
  cannotPlay: 'This audio format cannot be played on this computer.',

  // ringing
  /** @param {number} n */
  snoozeButton: (n) => `Snooze · ${n} min`,
  solveToTurnOff: 'Solve to turn off',
  typeCodeToTurnOff: 'Type the code to turn off',
  answer: 'Answer',
  code: 'Code',
  /** @param {string} label */
  alarmAria: (label) => `Alarm: ${label}`,
  /** @param {number} solved @param {number} total */
  solvedAria: (solved, total) => `${solved} of ${total} solved`,

  // timer
  start: 'Start',
  pause: 'Pause',
  resume: 'Resume',
  whenTimerEnds: 'When Timer Ends',
  recentsHeader: 'RECENTS',
  remove: 'Remove',
  removeRecentAria: 'Remove from recents',
  /** @param {string} d */
  startTimerAria: (d) => `Start ${d} timer`,
  hoursUnit: 'hours',
  minUnit: 'min',
  secUnit: 'sec',
  hoursAria: 'Hours',
  minutesAria: 'Minutes',
  secondsAria: 'Seconds',
  /** @param {string} mmss */
  isUp: (mmss) => `${mmss} is up`,
  repeatTimer: 'Repeat',
  timerDoneAria: 'Timer done',

  // stopwatch
  lap: 'Lap',
  reset: 'Reset',
  /** @param {number} n */
  lapN: (n) => `Lap ${n}`,

  // settings
  appearanceHeader: 'APPEARANCE',
  theme: 'Theme',
  themes: { system: 'Auto', light: 'Light', dark: 'Dark' },
  timeFormat: 'Time Format',
  hourCycles: { auto: 'Auto', '12h': '12-hour', '24h': '24-hour' },
  newAlarmDefaultsHeader: 'NEW ALARM DEFAULTS',
  difficulty: 'Difficulty',
  defaultsFooter: 'Applied to alarms you create from now on. Each alarm can still be changed individually.',
  defaultSound: 'Default Sound',
  defaultVolumeAria: 'Default volume',
  defaultTaskAria: 'Default dismissal task',
  defaultDifficultyAria: 'Default difficulty',
  defaultCountAria: 'Default task count',
  snoozeHeader: 'SNOOZE',
  /** @param {number} n */
  snoozeLength: (n) => `Snooze Length · ${n} min`,
  snoozeMinutesAria: 'Snooze minutes',
  reliabilityHeader: 'RELIABILITY',
  notifications: 'Notifications',
  on: 'On',
  blocked: 'Blocked',
  openAtLogin: 'Open at Login',
  keepAwake: 'Keep Computer Awake',
  keepAwakeAria: 'Keep computer awake while alarms are on',
  ringLateFor: 'Ring Late Alarms For',
  reliabilityFooter: 'Alarm keeps running in the menu bar / tray and rings even when its window is closed.',
  addMusicFile: 'Add Music File…',
  libraryFooter: 'Imported files are copied into the app’s local storage, so alarms keep working if the original is moved.',
  aboutHeader: 'ABOUT',
  version: 'Version',
  storage: 'Storage',
  thisComputerOnly: 'This computer only',

  // tray
  trayOpen: 'Open Alarm',
  /** @param {number} n */
  traySnooze: (n) => `Snooze ${n} min`,
  trayQuit: 'Quit',
})

/** Notification texts (§6, table "Уведомления"). */
export const N = Object.freeze({
  /** @param {string} label */
  alarmTitle: (label) => `⏰ ${label}`,
  /** @param {string} time */
  alarmBody: (time) => `${time}\nOpen the app to turn it off.`,
  /** @param {number} n */
  snoozeAction: (n) => `Snooze ${n} min`,
  /** @param {string} label */
  missedTitle: (label) => `Missed alarm: ${label}`,
  /** @param {string} time */
  missedBody: (time) => `It was set for ${time}, while the computer was asleep or the app was closed.`,
  /** @param {string} label */
  timerTitle: (label) => `⏱ ${label}`,
  /** @param {string} mmss */
  timerBody: (mmss) => `${mmss} timer is done.`,
  /** @param {string} label */
  timerMissedTitle: (label) => `${label} ended`,
  /** @param {string} mmss */
  timerMissedBody: (mmss) => `Your ${mmss} timer finished while the computer was asleep.`,
})

/**
 * @param {{ kind: 'builtin' | 'custom', id: string }} ref
 * @param {ReadonlyArray<{ id: string, name: string }>} customs
 */
export function soundName(ref, customs) {
  if (ref.kind === 'builtin') return BUILTIN_SOUNDS.find((s) => s.id === ref.id)?.name ?? 'Sunrise'
  return customs.find((s) => s.id === ref.id)?.name ?? S.missingFile
}

/** @param {{ label: string }} a */
export const alarmLabel = (a) => a.label.trim() || DEFAULT_ALARM_LABEL
/** @param {{ label: string }} t */
export const timerLabel = (t) => t.label.trim() || DEFAULT_TIMER_LABEL
