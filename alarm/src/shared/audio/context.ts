import { createStore } from '../lib/createStore'

export type AudioState = 'running' | 'locked' | 'unsupported'

export const audioStateStore = createStore<AudioState>('locked')

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) {
    audioStateStore.set('unsupported')
    return null
  }
  const created = new Ctor({ latencyHint: 'playback' })
  ctx = created
  const sync = () => audioStateStore.set(created.state === 'running' ? 'running' : 'locked')
  created.addEventListener('statechange', sync)
  sync()
  return created
}

/**
 * Browsers only start audio after a user gesture (installed desktop PWAs in
 * Chromium are exempt). Every gesture re-resumes the context, and so does
 * returning to the tab after the OS was asleep.
 */
export function installAudioUnlock() {
  const unlock = () => {
    const c = getAudioContext()
    if (c && c.state !== 'running') void c.resume().catch(() => {})
  }
  for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true })
  }
  document.addEventListener('visibilitychange', unlock)
  unlock()
}
