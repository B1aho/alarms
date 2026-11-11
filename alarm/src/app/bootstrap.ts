import { registerSW } from 'virtual:pwa-register'
import { installAudioUnlock, loadCustomSounds } from '@/shared/audio'
import { initSettings } from '@/shared/settings'

/** Everything that must be ready before the first render. */
export async function bootstrap(): Promise<void> {
  installAudioUnlock()
  registerSW({ immediate: true })
  await Promise.all([
    initSettings(),
    loadCustomSounds().catch((err) => console.error('[sounds] load failed', err)),
  ])
  if ('storage' in navigator && navigator.storage.persist) {
    // Ask the browser not to evict alarms/music under storage pressure.
    void navigator.storage.persist().catch(() => {})
  }
}
