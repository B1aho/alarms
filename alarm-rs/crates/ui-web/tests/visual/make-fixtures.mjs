// Builds the Snapshot fixtures in crates/ui-web/fixtures/ for the fake daemon.
// All times are UTC; the screenshots show Tuesday, November 10 2026, 11:51.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '../../fixtures')
mkdirSync(out, { recursive: true })

export const NOW = Date.UTC(2026, 10, 10, 11, 51, 0)
const at = (d, h, m) => Date.UTC(2026, 10, d, h, m, 0)
const MATH2 = { type: 'math', difficulty: 'medium', count: 2 }
const SUNRISE = { kind: 'builtin', id: 'sunrise' }

const settings = {
  theme: 'dark', hourCycle: '24h', snoozeMinutes: 9, rampSeconds: 60, volume: 0.9,
  defaultSound: SUNRISE, defaultTask: MATH2, keepAwake: false, missedGraceMinutes: 60, openAtLogin: true,
}
const alarm = (id, hour, minute, label, days, extra = {}) => ({
  id, hour, minute, label, enabled: true, days, sound: SUNRISE, volume: 0.9, rampSeconds: 60, snooze: true,
  task: MATH2, createdAt: at(1, 0, 0), nextTriggerAt: null, snoozeUntil: null, ringingSince: null, ...extra,
})
const ALARMS = [
  alarm('work', 6, 30, 'Work', [1, 2, 3, 4, 5], { nextTriggerAt: at(11, 6, 30) }),
  alarm('gym', 7, 15, 'Gym', [], { enabled: false, snoozeUntil: at(10, 11, 57) }),
  alarm('weekend', 9, 0, 'Weekend', [0, 6], { enabled: false }),
  alarm('vitamins', 22, 45, 'Take vitamins', [0, 1, 2, 3, 4, 5, 6], { nextTriggerAt: at(10, 22, 45) }),
]
const timer = {
  status: 'idle', durationMs: 300000, endsAt: null, remainingMs: 0, label: '',
  sound: { kind: 'builtin', id: 'chimes' }, recents: [],
}
const base = () => ({
  version: '1.0.0', platform: 'macos', now: NOW, alarms: structuredClone(ALARMS), settings: structuredClone(settings),
  hourCycle: '24h', timer: structuredClone(timer), stopwatch: { startedAt: null, accumulatedMs: 0, laps: [] },
  sounds: [], ringing: [], notifications: 'on', nextAlarmAt: at(10, 11, 57),
  newAlarm: { id: null, hour: 11, minute: 51, label: '', days: [], sound: SUNRISE, volume: 0.9, rampSeconds: 60, snooze: true, task: MATH2 },
  previewPlaying: false,
})
const RECENTS = [
  { durationMs: 300000, label: '' },
  { durationMs: 1500000, label: 'Focus' },
  { durationMs: 630000, label: 'Pasta' },
]

const fixtures = {}
fixtures.list = base()
fixtures.empty = { ...base(), alarms: [], nextAlarmAt: null }
fixtures.banner = { ...fixtures.empty, notifications: 'notDetermined' }
const ringing = (label, task, snooze = true, retype = false) => {
  const s = base()
  const a = alarm('ring', 11, 51, label, [], {
    enabled: false, ringingSince: NOW, snooze,
    task: retype ? { type: 'retype', difficulty: 'hard', count: 1 } : MATH2,
  })
  s.alarms.push(a)
  s.ringing = [{ alarm: a, task }]
  return s
}
fixtures.ringing = ringing('Work', null)
fixtures['ringing-math'] = ringing('Work', { kind: 'math', prompt: '3 × 13 + 41', solved: 0, total: 2, wrong: 0 })
fixtures['ringing-wrong'] = ringing('Work', { kind: 'math', prompt: '6 × 19 + 59', solved: 0, total: 2, wrong: 1 })
fixtures['ringing-nosnooze'] = ringing('Work', null, false)
fixtures['ringing-retype'] = ringing('Early flight', { kind: 'retype', prompt: 'RVR9 JT5K K6AS QF', solved: 0, total: 1, wrong: 0 }, true, true)
fixtures['sw-laps'] = { ...base(), stopwatch: { startedAt: NOW - 85720, accumulatedMs: 0, laps: [19870, 41150, 58930] } }
fixtures['sw-stopped'] = { ...base(), stopwatch: { startedAt: null, accumulatedMs: 85790, laps: [19870, 41150, 58930] } }
fixtures['timer-recents'] = { ...base(), timer: { ...timer, recents: RECENTS } }
fixtures['timer-running'] = {
  ...base(),
  timer: { ...timer, status: 'running', durationMs: 630000, endsAt: NOW + 370000, remainingMs: 630000, label: 'Pasta', recents: RECENTS },
}
fixtures['timer-paused'] = {
  ...base(),
  timer: { ...timer, status: 'paused', durationMs: 630000, endsAt: null, remainingMs: 370000, label: 'Pasta', recents: RECENTS },
}
fixtures['timer-done'] = {
  ...base(),
  timer: { ...timer, status: 'ringing', durationMs: 600000, endsAt: null, remainingMs: 0, label: 'Pasta', recents: RECENTS },
}

for (const [name, snap] of Object.entries(fixtures)) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(snap, null, 2) + '\n')
}
console.log(`wrote ${Object.keys(fixtures).length} fixtures to ${out}`)
