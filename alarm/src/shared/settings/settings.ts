import { z } from 'zod'
import { DEFAULT_SOUND, SoundRefSchema } from '../audio/sounds'
import { createKvEntry } from '../db/db'
import { createStore, useStore } from '../lib/createStore'
import { systemHourCycle, type HourCycle } from '../lib/time'

export const DismissTaskSchema = z.object({
  type: z.enum(['none', 'math', 'retype']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  count: z.number().int().min(1).max(5),
})
export type DismissTask = z.infer<typeof DismissTaskSchema>
export type TaskType = DismissTask['type']
export type Difficulty = DismissTask['difficulty']

export const SettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).catch('system'),
  hourCycle: z.enum(['auto', '12h', '24h']).catch('auto'),
  snoozeMinutes: z.number().int().min(1).max(30).catch(9),
  rampSeconds: z.number().int().min(0).max(600).catch(60),
  volume: z.number().min(0.05).max(1).catch(0.9),
  defaultSound: SoundRefSchema.catch(DEFAULT_SOUND),
  defaultTask: DismissTaskSchema.catch({ type: 'math', difficulty: 'medium', count: 2 }),
  keepAwake: z.boolean().catch(false),
  missedGraceMinutes: z.number().int().min(1).max(240).catch(60),
})
export type Settings = z.infer<typeof SettingsSchema>

export const defaultSettings = (): Settings => SettingsSchema.parse({})

const entry = createKvEntry('settings', SettingsSchema, defaultSettings)

export const settingsStore = createStore<Settings>(defaultSettings())

export async function initSettings(): Promise<void> {
  try {
    settingsStore.set(await entry.get())
  } catch (err) {
    console.error('[settings] failed to load, using defaults', err)
  }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const next = SettingsSchema.parse({ ...settingsStore.get(), ...patch })
  settingsStore.set(next)
  await entry.set(next)
}

export function useSettings(): Settings {
  return useStore(settingsStore)
}

export function resolveHourCycle(s: Pick<Settings, 'hourCycle'>): HourCycle {
  return s.hourCycle === 'auto' ? systemHourCycle() : s.hourCycle
}

export function useHourCycle(): HourCycle {
  return resolveHourCycle(useSettings())
}
