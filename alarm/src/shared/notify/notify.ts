import { createStore, useStore } from '../lib/createStore'

export type NotifyPermission = NotificationPermission | 'unsupported'

const current = (): NotifyPermission => ('Notification' in window ? Notification.permission : 'unsupported')

export const notifyPermissionStore = createStore<NotifyPermission>(current())

export function useNotifyPermission(): NotifyPermission {
  return useStore(notifyPermissionStore)
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!('Notification' in window)) return 'unsupported'
  const result = await Notification.requestPermission()
  notifyPermissionStore.set(result)
  return result
}

export interface NotifyOptions {
  body?: string
  tag?: string
  requireInteraction?: boolean
  data?: unknown
  actions?: Array<{ action: string; title: string }>
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  try {
    return await navigator.serviceWorker.getRegistration()
  } catch {
    return undefined
  }
}

/** System notification. Goes through the service worker so it works while the tab is hidden. */
export async function notify(title: string, opts: NotifyOptions = {}): Promise<void> {
  notifyPermissionStore.set(current())
  if (current() !== 'granted') return
  const options = {
    body: opts.body,
    tag: opts.tag,
    data: opts.data,
    requireInteraction: opts.requireInteraction ?? false,
    actions: opts.actions,
    renotify: Boolean(opts.tag),
    silent: false,
    icon: '/pwa-192.png',
    badge: '/pwa-192.png',
  } as NotificationOptions
  const reg = await registration()
  try {
    if (reg) await reg.showNotification(title, options)
    else new Notification(title, options)
  } catch (err) {
    console.warn('[notify] failed', err)
  }
}

export async function closeNotifications(tag: string): Promise<void> {
  const reg = await registration()
  if (!reg) return
  const list = await reg.getNotifications({ tag })
  list.forEach((n) => n.close())
}

export interface NotificationActionMessage {
  type: 'alarm:notification'
  action: string
  data: unknown
}

/** Fires when the user clicks a notification (or one of its buttons). */
export function onNotificationAction(cb: (msg: NotificationActionMessage) => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {}
  const handler = (event: MessageEvent) => {
    const msg = event.data as NotificationActionMessage | undefined
    if (msg?.type === 'alarm:notification') cb(msg)
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}
