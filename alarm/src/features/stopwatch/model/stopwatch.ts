import { z } from 'zod'
import { createKvEntry } from '@/shared/db'
import { createChannel, createStore, useStore } from '@/shared/lib'

const StopwatchSchema = z.object({
  startedAt: z.number().nullable().catch(null),
  accumulatedMs: z.number().min(0).catch(0),
  /** Total elapsed time at each lap press. */
  laps: z.array(z.number()).catch([]),
})
export type StopwatchState = z.infer<typeof StopwatchSchema>

const initial = (): StopwatchState => ({ startedAt: null, accumulatedMs: 0, laps: [] })
const entry = createKvEntry('stopwatch', StopwatchSchema, initial)
const channel = createChannel('stopwatch')

export const stopwatchStore = createStore<StopwatchState>(initial())
export const useStopwatch = () => useStore(stopwatchStore)

export async function loadStopwatch() {
  stopwatchStore.set(await entry.get())
}
channel.subscribe(() => void loadStopwatch())

async function update(next: StopwatchState) {
  stopwatchStore.set(next)
  await entry.set(next)
  channel.post()
}

export const elapsedAt = (s: StopwatchState, now: number) => s.accumulatedMs + (s.startedAt !== null ? now - s.startedAt : 0)

export function startStopwatch() {
  const s = stopwatchStore.get()
  if (s.startedAt === null) void update({ ...s, startedAt: Date.now() })
}

export function stopStopwatch() {
  const s = stopwatchStore.get()
  if (s.startedAt !== null) void update({ ...s, accumulatedMs: elapsedAt(s, Date.now()), startedAt: null })
}

export function lapStopwatch() {
  const s = stopwatchStore.get()
  if (s.startedAt !== null) void update({ ...s, laps: [...s.laps, elapsedAt(s, Date.now())] })
}

export function resetStopwatch() {
  void update(initial())
}

/** Lap durations (newest first) with best/worst markers once there are 2+ completed laps. */
export function lapRows(s: StopwatchState, now: number) {
  const splits = s.laps.map((t, i) => t - (i === 0 ? 0 : s.laps[i - 1]!))
  const min = splits.length >= 2 ? Math.min(...splits) : null
  const max = splits.length >= 2 ? Math.max(...splits) : null
  const rows = splits.map((ms, i) => ({
    n: i + 1,
    ms,
    best: ms === min,
    worst: ms === max,
  }))
  const current = elapsedAt(s, now) - (s.laps.at(-1) ?? 0)
  return { current: { n: s.laps.length + 1, ms: current }, completed: rows.reverse() }
}
