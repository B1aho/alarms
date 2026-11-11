import { soundsTable } from '../db/db'
import { createStore, useStore } from '../lib/createStore'
import { uid } from '../lib/cn'
import { BUILTIN_SOUNDS, DEFAULT_SOUND, type BuiltinSoundId, type SoundRef } from './sounds'
import { renderBuiltin } from './tones'

export interface CustomSoundMeta {
  id: string
  name: string
  size: number
  addedAt: number
}

export const customSoundsStore = createStore<CustomSoundMeta[]>([])

export function useCustomSounds(): CustomSoundMeta[] {
  return useStore(customSoundsStore)
}

export async function loadCustomSounds(): Promise<void> {
  const rows = await soundsTable.list()
  customSoundsStore.set(
    rows
      .map(({ id, name, size, addedAt }) => ({ id, name, size, addedAt }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
}

const MAX_BYTES = 80 * 1024 * 1024
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i

/** Validates (by actually decoding) and stores a music file from the user's computer. */
export async function addCustomSound(file: File): Promise<CustomSoundMeta> {
  if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) {
    throw new Error('That file is not an audio file.')
  }
  if (file.size > MAX_BYTES) throw new Error('That file is larger than 80 MB.')
  try {
    await decode(await file.arrayBuffer())
  } catch {
    throw new Error('This audio format cannot be played by your browser.')
  }
  const meta: CustomSoundMeta = {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, ''),
    size: file.size,
    addedAt: Date.now(),
  }
  await soundsTable.put({ ...meta, type: file.type, blob: file })
  await loadCustomSounds()
  return meta
}

export async function removeCustomSound(id: string): Promise<void> {
  await soundsTable.remove(id)
  bufferCache.delete(id)
  await loadCustomSounds()
}

function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  // An OfflineAudioContext decodes without needing a user gesture.
  const ctx = new OfflineAudioContext(2, 1, 44100)
  return ctx.decodeAudioData(data)
}

const bufferCache = new Map<string, Promise<AudioBuffer>>()

async function loadCustomBuffer(id: string): Promise<AudioBuffer> {
  const row = await soundsTable.get(id)
  if (!row) throw new Error(`Custom sound ${id} not found`)
  return decode(await row.blob.arrayBuffer())
}

export function loadSoundBuffer(ref: SoundRef): Promise<AudioBuffer> {
  if (ref.kind === 'builtin') {
    const known = BUILTIN_SOUNDS.some((s) => s.id === ref.id)
    return renderBuiltin((known ? ref.id : DEFAULT_SOUND.id) as BuiltinSoundId)
  }
  let p = bufferCache.get(ref.id)
  if (!p) {
    p = loadCustomBuffer(ref.id)
    p.catch(() => bufferCache.delete(ref.id))
    bufferCache.set(ref.id, p)
  }
  return p
}

export function soundName(ref: SoundRef, customs: CustomSoundMeta[]): string {
  if (ref.kind === 'builtin') return BUILTIN_SOUNDS.find((s) => s.id === ref.id)?.name ?? 'Sunrise'
  return customs.find((s) => s.id === ref.id)?.name ?? 'Missing file'
}
