/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

// Offline first: the whole app shell is precached.
void self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

try {
  registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))
} catch {
  // index.html is not precached in dev mode.
}

interface NotificationMessage {
  type: 'alarm:notification'
  action: string
  data: unknown
}

/**
 * Clicking an alarm notification focuses the app (or opens it). Button presses
 * (e.g. "Snooze") are forwarded to the open windows, where the engine acts.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const message: NotificationMessage = {
    type: 'alarm:notification',
    action: event.action,
    data: event.notification.data,
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      windows.forEach((w) => w.postMessage(message))
      if (event.action === 'snooze') return
      const target = windows[0]
      if (target) await target.focus()
      else await self.clients.openWindow('/alarms')
    })(),
  )
})
