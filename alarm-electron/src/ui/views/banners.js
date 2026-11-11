/** Notification banners on the Alarms page (ALARM_SPEC §3.14, TZ §3.8–3.9). */

import { S } from '../../domain/strings.js'
import { filledButton } from '../widgets/button.js'
import { BellIcon } from '../widgets/icons.js'
import { banner } from '../widgets/row.js'

/** @param {import('../model.js').Model} m */
export function notificationBanner(m) {
  const app = m.app
  if (!app) return null
  const state = app.system.notifications
  if (state === 'granted') return null
  if (state === 'denied') {
    return banner({
      icon: BellIcon('tone-red'),
      title: S.notificationsBlocked,
      text: S.notificationsBlockedHint(app.system.platform),
    })
  }
  return banner({
    icon: BellIcon('tone-accent'),
    title: S.allowNotifications,
    text: S.allowNotificationsHint,
    action: filledButton({ class: 'pill', onclick: () => ({ type: 'RequestNotifications' }) }, S.turnOn),
  })
}
