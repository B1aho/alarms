import { z } from 'zod'
import { DEFAULT_SOUND, SoundRefSchema, startPlayback, type Playback } from '@/shared/audio'
import { createKvEntry } from '@/shared/db'
import { createChannel, createStore, formatCountdown, runAsLeader, subscribeTick, useStore } from '@/shared/lib'
import { closeNotifications, notify } from '@/shared/notify'

const TimerSchema = z.object({
  status: z.enum(['idle', 'running', 'paused', 'ringing']).catch('idle'),
  durationMs: z.number().min(1000).catch(5 * 60_000),
  endsAt: z.number().nullable().catch(null),
  remainingMs: z.number().catch(0),
  label: z.string().max(60).catch(''),
  sound: SoundRefSchema.catch({ kind: 'builtin', id: 'chimes' }),
  recents: z.array(z.object({ durationMs: z.number(), label: z.string() })).catch([]),
})
export type TimerState = z.infer<typeof TimerSchema>

const initial = (): TimerState => ({
  status: 'idle',
  durationMs: 5 * 60_000,
  endsAt: null,
  remainingMs: 0,
  label: '',
  sound: { ...DEFAULT_SOUND, id: 'chimes' },
  recents: [],
})

const entry = createKvEntry('timer', TimerSchema, initial)
const channel = createChannel('timer')
export const timerStore = createStore<TimerState>(initial())
let loaded = false

export const useTimer = () => useStore(timerStore)

export async function loadTimer() {
  timerStore.set(await entry.get())
  loaded = true
}
channel.subscribe(() => void loadTimer())

async function update(patch: Partial<TimerState>) {
  const next = { ...timerStore.get(), ...patch }
  timerStore.set(next)
  await entry.set(next)
  channel.post()
}

export const timerLabel = (s: Pick<TimerState, 'label'>) => s.label.trim() || 'Timer'

export function remainingAt(s: TimerState, now: number): number {
  if (s.status === 'running' && s.endsAt !== null) return Math.max(0, s.endsAt - now)
  if (s.status === 'paused') return s.remainingMs
  return s.status === 'ringing' ? 0 : s.durationMs
}

// ---------------------------------------------------------------- actions --

export async function startTimer(durationMs: number, label = timerStore.get().label) {
  const recents = [{ durationMs, label }, ...timerStore.get().recents.filter((r) => r.durationMs !== durationMs)].slice(0, 6)
  await update({ status: 'running', durationMs, label, endsAt: Date.now() + durationMs, remainingMs: durationMs, recents })
}

export async function pauseTimer() {
  const s = timerStore.get()
  if (s.status !== 'running' || s.endsAt === null) return
  await update({ status: 'paused', remainingMs: Math.max(0, s.endsAt - Date.now()), endsAt: null })
}

export async function resumeTimer() {
  const s = timerStore.get()
  if (s.status !== 'paused') return
  await update({ status: 'running', endsAt: Date.now() + s.remainingMs })
}

export async function cancelTimer() {
  await update({ status: 'idle', endsAt: null, remainingMs: 0 })
  void closeNotifications('timer')
}

export async function stopTimerRinging() {
  await update({ status: 'idle', endsAt: null, remainingMs: 0 })
  void closeNotifications('timer')
}

export async function repeatTimer() {
  await startTimer(timerStore.get().durationMs)
  void closeNotifications('timer')
}

export const setTimerDuration = (durationMs: number) => update({ durationMs: Math.max(1000, durationMs) })
export const setTimerLabel = (label: string) => update({ label })
export const setTimerSound = (sound: TimerState['sound']) => update({ sound })
export const removeRecent = (durationMs: number) =>
  update({ recents: timerStore.get().recents.filter((r) => r.durationMs !== durationMs) })

// ----------------------------------------------------------------- engine --

const LATE_LIMIT_MS = 10 * 60_000
let playback: Playback | null = null

function syncSound() {
  const s = timerStore.get()
  if (s.status === 'ringing' && !playback) playback = startPlayback(s.sound, { volume: 0.9, rampSeconds: 3 })
  if (s.status !== 'ringing' && playback) {
    playback.stop(200)
    playback = null
  }
}

function tick(now: number) {
  const s = timerStore.get()
  if (!loaded || s.status !== 'running' || s.endsAt === null || now < s.endsAt) return
  if (now - s.endsAt > LATE_LIMIT_MS) {
    void update({ status: 'idle', endsAt: null })
    void notify(`${timerLabel(s)} ended`, { body: `Your ${formatCountdown(s.durationMs)} timer finished while the computer was asleep.`, tag: 'timer' })
    return
  }
  void update({ status: 'ringing', endsAt: null, remainingMs: 0 })
  void notify(`⏱ ${timerLabel(s)}`, {
    body: `${formatCountdown(s.durationMs)} timer is done.`,
    tag: 'timer',
    requireInteraction: true,
    data: { kind: 'timer' },
  })
}

export function startTimerEngine(): () => void {
  return runAsLeader('timer-engine', () => {
    const unTick = subscribeTick(tick)
    const unSync = timerStore.subscribe(syncSound)
    syncSound()
    return () => {
      unTick()
      unSync()
      playback?.stop()
      playback = null
    }
  })
}
