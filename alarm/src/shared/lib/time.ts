export type HourCycle = '12h' | '24h'

export const pad2 = (n: number) => String(Math.floor(n)).padStart(2, '0')

export function systemHourCycle(): HourCycle {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
    return hc === 'h11' || hc === 'h12' ? '12h' : '24h'
  } catch {
    return '24h'
  }
}

export function formatClock(hour: number, minute: number, cycle: HourCycle): { time: string; period: string | null } {
  if (cycle === '24h') return { time: `${pad2(hour)}:${pad2(minute)}`, period: null }
  const h = hour % 12 === 0 ? 12 : hour % 12
  return { time: `${h}:${pad2(minute)}`, period: hour < 12 ? 'AM' : 'PM' }
}

export function formatClockString(hour: number, minute: number, cycle: HourCycle): string {
  const { time, period } = formatClock(hour, minute, cycle)
  return period ? `${time} ${period}` : time
}

export function formatTimestamp(ts: number, cycle: HourCycle): string {
  const d = new Date(ts)
  return formatClockString(d.getHours(), d.getMinutes(), cycle)
}

/** "7 hr 12 min", "45 min", "less than a minute" */
export function formatRelative(ms: number): string {
  if (ms < 60_000) return 'less than a minute'
  const totalMin = Math.round(ms / 60_000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const minutes = totalMin % 60
  const parts: string[] = []
  if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours) parts.push(`${hours} hr`)
  if (minutes && !days) parts.push(`${minutes} min`)
  return parts.join(' ')
}

/** Countdown: "H:MM:SS" or "MM:SS" (rounded up to the next second, like iOS). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/** Stopwatch: "MM:SS.cc" (hours prepended when needed). */
export function formatStopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000) % 60
  const h = Math.floor(total / 360000)
  const base = `${pad2(m)}:${pad2(s)}.${pad2(cs)}`
  return h > 0 ? `${h}:${base}` : base
}

export function formatDurationShort(seconds: number): string {
  if (seconds <= 0) return 'Off'
  if (seconds < 60) return `${seconds} sec`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} sec` : `${m} min`
}
