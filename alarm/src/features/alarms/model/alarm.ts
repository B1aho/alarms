import { z } from 'zod'
import { SoundRefSchema } from '@/shared/audio'
import { uid } from '@/shared/lib'
import { DismissTaskSchema, type Settings } from '@/shared/settings'

export const AlarmSchema = z.object({
  id: z.string(),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  label: z.string().max(60).catch(''),
  enabled: z.boolean(),
  /** Repeat days, 0 = Sunday … 6 = Saturday. Empty = one-shot. */
  days: z.array(z.number().int().min(0).max(6)).catch([]),
  sound: SoundRefSchema,
  volume: z.number().min(0.05).max(1),
  /** Seconds of gradual volume increase; 0 = off. */
  rampSeconds: z.number().int().min(0).max(600),
  snooze: z.boolean(),
  task: DismissTaskSchema,
  createdAt: z.number(),
  /** Next scheduled ring time (ms epoch); null when disabled. */
  nextTriggerAt: z.number().nullable().catch(null),
  snoozeUntil: z.number().nullable().catch(null),
  /** Set while the alarm is ringing, so ringing survives a reload. */
  ringingSince: z.number().nullable().catch(null),
})

export type Alarm = z.infer<typeof AlarmSchema>

export const DEFAULT_LABEL = 'Alarm'

export const displayLabel = (a: Pick<Alarm, 'label'>) => a.label.trim() || DEFAULT_LABEL

export function newAlarm(settings: Settings, now = new Date()): Alarm {
  return {
    id: uid(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    label: '',
    enabled: true,
    days: [],
    sound: settings.defaultSound,
    volume: settings.volume,
    rampSeconds: settings.rampSeconds,
    snooze: true,
    task: settings.defaultTask,
    createdAt: now.getTime(),
    nextTriggerAt: null,
    snoozeUntil: null,
    ringingSince: null,
  }
}
