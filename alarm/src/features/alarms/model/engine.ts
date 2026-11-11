import { startPlayback, type Playback } from '@/shared/audio'
import { formatClockString, runAsLeader, subscribeTick } from '@/shared/lib'
import { closeNotifications, notify, onNotificationAction } from '@/shared/notify'
import { resolveHourCycle, settingsStore } from '@/shared/settings'
import { displayLabel, type Alarm } from './alarm'
import { advanceAfterTrigger, evaluate } from './schedule'
import { alarmsStore, getAlarm, patchAlarm } from './store'

/**
 * The alarm engine runs in exactly one tab (Web Lock leader). It evaluates
 * every alarm on each worker heartbeat, starts/stops ringing sounds to match
 * the persisted `ringingSince` state, and posts system notifications.
 */

const sounds = new Map<string, Playback>()
let busy = false

const MISSED_NOTIFY_LIMIT_MS = 12 * 3600_000
const tag = (id: string) => `alarm-${id}`

async function tick(now: number) {
  if (busy) return
  busy = true
  try {
    const { loaded, items } = alarmsStore.get()
    if (!loaded) return
    const settings = settingsStore.get()
    const graceMs = settings.missedGraceMinutes * 60_000

    for (const a of items) {
      const verdict = evaluate(a, now, { graceMs })
      if (verdict.kind === 'ring') {
        const advance = verdict.source === 'schedule' ? advanceAfterTrigger(a, verdict.trigger, now) : { snoozeUntil: null }
        await patchAlarm(a.id, { ...advance, ringingSince: now })
        void announce(a)
      } else if (verdict.kind === 'missed') {
        const advance = verdict.source === 'schedule' ? advanceAfterTrigger(a, verdict.trigger, now) : { snoozeUntil: null }
        await patchAlarm(a.id, advance)
        if (now - verdict.trigger < MISSED_NOTIFY_LIMIT_MS) {
          const d = new Date(verdict.trigger)
          void notify(`Missed alarm: ${displayLabel(a)}`, {
            body: `It was set for ${formatClockString(d.getHours(), d.getMinutes(), resolveHourCycle(settings))}, while the computer was asleep or the app was closed.`,
            tag: tag(a.id),
          })
        }
      }
    }
    syncSounds()
  } finally {
    busy = false
  }
}

function announce(a: Alarm) {
  const cycle = resolveHourCycle(settingsStore.get())
  return notify(`⏰ ${displayLabel(a)}`, {
    body: `${formatClockString(a.hour, a.minute, cycle)}\nOpen the app to turn it off.`,
    tag: tag(a.id),
    requireInteraction: true,
    data: { kind: 'alarm', id: a.id },
    actions: a.snooze ? [{ action: 'snooze', title: `Snooze ${settingsStore.get().snoozeMinutes} min` }] : [],
  })
}

/** Make the set of playing sounds match the alarms that are ringing. */
function syncSounds() {
  const ringing = new Map(alarmsStore.get().items.filter((a) => a.ringingSince !== null).map((a) => [a.id, a]))
  for (const [id, playback] of sounds) {
    if (!ringing.has(id)) {
      playback.stop(250)
      sounds.delete(id)
    }
  }
  for (const [id, a] of ringing) {
    if (!sounds.has(id)) sounds.set(id, startPlayback(a.sound, { volume: a.volume, rampSeconds: a.rampSeconds }))
  }
}

function stopAllSounds() {
  sounds.forEach((p) => p.stop())
  sounds.clear()
}

export function startAlarmEngine(): () => void {
  return runAsLeader('alarm-engine', () => {
    const unTick = subscribeTick((now) => void tick(now))
    const unSync = alarmsStore.subscribe(syncSounds)
    const unNotify = onNotificationAction((msg) => {
      const data = msg.data as { kind?: string; id?: string } | null
      if (data?.kind === 'alarm' && data.id && msg.action === 'snooze') void snoozeAlarm(data.id)
    })
    void tick(Date.now())
    return () => {
      unTick()
      unSync()
      unNotify()
      stopAllSounds()
    }
  })
}

// ------------------------------------------------------- user actions --

export async function snoozeAlarm(id: string): Promise<void> {
  const a = getAlarm(id)
  if (!a || a.ringingSince === null || !a.snooze) return
  await patchAlarm(id, { ringingSince: null, snoozeUntil: Date.now() + settingsStore.get().snoozeMinutes * 60_000 })
  void closeNotifications(tag(id))
}

export async function dismissAlarm(id: string): Promise<void> {
  const a = getAlarm(id)
  if (!a) return
  await patchAlarm(id, { ringingSince: null, snoozeUntil: null })
  void closeNotifications(tag(id))
}

/** Stop a snooze from the alarm list without waiting for it to ring. */
export async function cancelSnooze(id: string): Promise<void> {
  await patchAlarm(id, { snoozeUntil: null })
}
