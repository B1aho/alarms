import { z } from 'zod'

export const SoundRefSchema = z.object({
  kind: z.enum(['builtin', 'custom']),
  id: z.string().min(1),
})
export type SoundRef = z.infer<typeof SoundRefSchema>

export const BUILTIN_SOUNDS = [
  { id: 'sunrise', name: 'Sunrise' },
  { id: 'harp', name: 'Harp' },
  { id: 'chimes', name: 'Chimes' },
  { id: 'beacon', name: 'Beacon' },
  { id: 'pulse', name: 'Pulse' },
  { id: 'classic', name: 'Classic Bell' },
] as const

export type BuiltinSoundId = (typeof BUILTIN_SOUNDS)[number]['id']

export const DEFAULT_SOUND: SoundRef = { kind: 'builtin', id: 'sunrise' }
