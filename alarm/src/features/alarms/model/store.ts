import { createCollection } from '@/shared/db'
import { createChannel, createStore, useStore } from '@/shared/lib'
import { AlarmSchema, type Alarm } from './alarm'
import { nextOccurrence } from './schedule'

const repo = createCollection('alarms', AlarmSchema)
const channel = createChannel('alarms')

export interface AlarmsState {
  loaded: boolean
  items: Alarm[]
}

export const alarmsStore = createStore<AlarmsState>({ loaded: false, items: [] })

export function useAlarms(): AlarmsState {
  return useStore(alarmsStore)
}

const byTime = (a: Alarm, b: Alarm) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute) || a.createdAt - b.createdAt

export async function loadAlarms(): Promise<void> {
  const items = await repo.getAll()
  const now = Date.now()
  const repaired: Alarm[] = []
  for (const a of items) {
    if (a.enabled && a.nextTriggerAt === null) {
      const fixed = { ...a, nextTriggerAt: nextOccurrence(a, now) }
      repaired.push(fixed)
      await repo.put(fixed)
    } else repaired.push(a)
  }
  alarmsStore.set({ loaded: true, items: repaired.sort(byTime) })
}

// Other tabs changed data → reload.
channel.subscribe(() => void loadAlarms())

async function write(next: Alarm): Promise<void> {
  alarmsStore.set((s) => ({
    ...s,
    items: [...s.items.filter((a) => a.id !== next.id), next].sort(byTime),
  }))
  await repo.put(next)
  channel.post()
}

export function getAlarm(id: string): Alarm | undefined {
  return alarmsStore.get().items.find((a) => a.id === id)
}

/** Save from the editor: reschedules from scratch and clears any snooze. */
export async function saveAlarm(alarm: Alarm): Promise<void> {
  await write({
    ...alarm,
    nextTriggerAt: alarm.enabled ? nextOccurrence(alarm, Date.now()) : null,
    snoozeUntil: null,
    ringingSince: null,
  })
}

export async function setAlarmEnabled(id: string, enabled: boolean): Promise<void> {
  const a = getAlarm(id)
  if (!a) return
  await write({
    ...a,
    enabled,
    nextTriggerAt: enabled ? nextOccurrence(a, Date.now()) : null,
    snoozeUntil: null,
  })
}

export async function patchAlarm(id: string, patch: Partial<Alarm>): Promise<void> {
  const a = getAlarm(id)
  if (!a) return
  await write({ ...a, ...patch })
}

export async function deleteAlarm(id: string): Promise<void> {
  alarmsStore.set((s) => ({ ...s, items: s.items.filter((a) => a.id !== id) }))
  await repo.remove(id)
  channel.post()
}
