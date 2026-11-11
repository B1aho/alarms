/** Time and size formats (ALARM_SPEC.md §3.13). Pure functions. */

import { S } from './strings.js'

/** @typedef {'12h' | '24h'} HourCycle */

/** @param {number} n */
export const pad2 = (n) => String(Math.floor(n)).padStart(2, '0')

/**
 * @param {'auto' | '12h' | '24h'} setting
 * @param {HourCycle} system hour cycle of the OS locale
 * @returns {HourCycle}
 */
export const resolveHourCycle = (setting, system) => (setting === 'auto' ? system : setting)

/**
 * `Intl` hour cycle → our two formats.
 * @param {string | undefined} hc resolvedOptions().hourCycle
 * @returns {HourCycle}
 */
export const hourCycleFromIntl = (hc) => (hc === 'h11' || hc === 'h12' ? '12h' : '24h')

/**
 * @param {number} hour
 * @param {number} minute
 * @param {HourCycle} cycle
 * @returns {{ time: string, period: string | null }}
 */
export function formatClock(hour, minute, cycle) {
  if (cycle === '24h') return { time: `${pad2(hour)}:${pad2(minute)}`, period: null }
  const h = hour % 12 === 0 ? 12 : hour % 12
  return { time: `${h}:${pad2(minute)}`, period: hour < 12 ? 'AM' : 'PM' }
}

/**
 * @param {number} hour
 * @param {number} minute
 * @param {HourCycle} cycle
 */
export function formatClockString(hour, minute, cycle) {
  const { time, period } = formatClock(hour, minute, cycle)
  return period ? `${time} ${period}` : time
}

/**
 * @param {number} ts
 * @param {HourCycle} cycle
 */
export function formatTimestamp(ts, cycle) {
  const d = new Date(ts)
  return formatClockString(d.getHours(), d.getMinutes(), cycle)
}

/**
 * "7 hr 12 min", "45 min", "less than a minute", "1 day 3 hr".
 * @param {number} ms
 */
export function formatRelative(ms) {
  if (ms < 60_000) return 'less than a minute'
  const totalMin = Math.round(ms / 60_000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const minutes = totalMin % 60
  /** @type {string[]} */
  const parts = []
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours) parts.push(`${hours} hr`)
  if (minutes && !days) parts.push(`${minutes} min`)
  return parts.join(' ')
}

/**
 * Countdown "H:MM:SS" or "MM:SS", rounded up to the next second.
 * @param {number} ms
 */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/**
 * Stopwatch "MM:SS.cc" (hours prepended when needed).
 * @param {number} ms
 */
export function formatStopwatch(ms) {
  const total = Math.max(0, Math.floor(ms / 10))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000) % 60
  const h = Math.floor(total / 360000)
  const base = `${pad2(m)}:${pad2(s)}.${pad2(cs)}`
  return h > 0 ? `${h}:${base}` : base
}

/**
 * Gradual volume: "Off", "15 sec", "1 min", "1 min 30 sec".
 * @param {number} seconds
 */
export function formatDurationShort(seconds) {
  if (seconds <= 0) return S.off
  if (seconds < 60) return `${seconds} sec`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} sec` : `${m} min`
}

/**
 * Timer recents subtitle: "5 min", "10 min 30 sec", "1 hr 2 min".
 * @param {number} ms
 */
export function describeDuration(ms) {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(' ')
}

/**
 * Late-alarm grace option: "5 min", "1 hr".
 * @param {number} minutes
 */
export const formatGrace = (minutes) => (minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`)

/**
 * "X.X MB"
 * @param {number} bytes
 */
export const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Ringing screen date: "Tuesday, November 10".
 * @param {number} ts
 */
export function formatLongDate(ts) {
  const d = new Date(ts)
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}
