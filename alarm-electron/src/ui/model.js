/**
 * The window's single state object, and pure selectors over it.
 * `app` is the engine's latest projection (null until the first one arrives).
 */

import { resolveHourCycle } from '../domain/format.js'

/** @typedef {import('../contract/transient.js').Projection} Projection */
/** @typedef {import('../contract/commands.js').AlarmDraft} AlarmDraft */
/** @typedef {import('../contract/commands.js').SoundRef} SoundRef */
/** @typedef {import('../contract/events.js').Problem} Problem */
/** @typedef {'alarms' | 'stopwatch' | 'timer' | 'settings'} Route */
/** @typedef {'main' | 'repeat' | 'sound' | 'ramp' | 'task'} EditorPage */
/** @typedef {'editor' | 'timer' | 'default' | 'library'} SoundTarget */

/**
 * @typedef {object} Editor
 * @property {AlarmDraft} draft
 * @property {boolean} isNew
 * @property {EditorPage} page
 * @property {boolean} previewing  "Preview Wake-up" is playing
 * @property {Problem | null} example task example on the Turn Off With page
 */

/**
 * @typedef {object} Model
 * @property {Route} route
 * @property {Projection | null} app
 * @property {number} now wall clock (ms) of the last tick or frame
 * @property {number} seed state of the UI's deterministic random generator
 * @property {boolean} systemDark
 * @property {string} platform
 * @property {boolean} editMode
 * @property {string | null} confirmDelete alarm id whose Delete button is shown
 * @property {Editor | null} editor
 * @property {'timerSound' | 'defaultSound' | null} sheet
 * @property {{ requestId: string, target: SoundTarget } | null} importReq
 * @property {{ target: SoundTarget, text: string } | null} importError
 * @property {{ id: string | null, stage: 'idle' | 'task', input: string, shake: number, seenFailures: number, round: number }} ringing  `round`: the task round the card waits for
 * @property {string | null} timerLabel label draft while the field is being edited
 */

/**
 * @param {{ now: number, seed: number, systemDark: boolean, platform: string }} flags
 * @returns {Model}
 */
export function init(flags) {
  return {
    route: 'alarms',
    app: null,
    now: flags.now,
    seed: flags.seed >>> 0,
    systemDark: flags.systemDark,
    platform: flags.platform,
    editMode: false,
    confirmDelete: null,
    editor: null,
    sheet: null,
    importReq: null,
    importError: null,
    ringing: { id: null, stage: 'idle', input: '', shake: 0, seenFailures: 0, round: 0 },
    timerLabel: null,
  }
}

/** Engine time: wall clock plus the engine's (test) clock offset. @param {Model} m */
export const nowOf = (m) => m.now + (m.app?.clockOffsetMs ?? 0)

/** @param {Model} m @returns {'12h' | '24h'} */
export const hourCycleOf = (m) => (m.app ? resolveHourCycle(m.app.settings.hourCycle, m.app.system.hourCycle) : '24h')

/** First ringing alarm in list order (§3.4: several may ring; the screen shows the first). @param {Model} m */
export const ringingAlarm = (m) => m.app?.alarms.find((a) => a.ringingSince !== null) ?? null

/** @param {Model} m @returns {'light' | 'dark'} */
export function themeOf(m) {
  const t = m.app?.settings.theme ?? 'system'
  return t === 'system' ? (m.systemDark ? 'dark' : 'light') : t
}

/** @param {Model} m */
export const timerActive = (m) => m.app?.timer.status === 'running' || m.app?.timer.status === 'paused'

/** Whether a sound import for this target is in flight. @param {Model} m @param {SoundTarget} target */
export const importing = (m, target) => m.importReq?.target === target

/** @param {Model} m @param {SoundTarget} target */
export const importErrorFor = (m, target) => (m.importError?.target === target ? m.importError.text : null)
