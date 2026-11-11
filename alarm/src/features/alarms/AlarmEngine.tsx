import { useEffect } from 'react'
import { useWakeLock } from '@/shared/lib'
import { useSettings } from '@/shared/settings'
import { startAlarmEngine } from './model/engine'
import { loadAlarms, useAlarms } from './model/store'
import { RingingOverlay } from './ui/RingingOverlay'

/** Mounted once at the app root: loads data, runs the scheduler, shows the ringing screen. */
export function AlarmEngine() {
  const { items } = useAlarms()
  const { keepAwake } = useSettings()

  useEffect(() => {
    void loadAlarms().catch((err) => console.error('[alarms] load failed', err))
    return startAlarmEngine()
  }, [])

  useWakeLock(keepAwake && items.some((a) => a.enabled || a.snoozeUntil !== null || a.ringingSince !== null))

  return <RingingOverlay />
}
