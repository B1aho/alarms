/** Root view: top bar, current page, sheets, timer alert and the ringing screen. */

import { h } from '../kernel/h.js'
import { alarmsPage } from './alarms/alarms-page.js'
import { editorSheet } from './editor/editor.js'
import { ringingScreen } from './ringing/ringing.js'
import { defaultSoundSheet, settingsPage } from './settings/settings-page.js'
import { stopwatchPage } from './stopwatch.js'
import { timerAlert } from './timer/timer-alert.js'
import { timerPage, timerSoundSheet } from './timer/timer-page.js'
import { topbar } from './topbar.js'

/** @param {import('../model.js').Model} m */
export function view(m) {
  const page =
    m.route === 'alarms'
      ? alarmsPage(m)
      : m.route === 'stopwatch'
        ? stopwatchPage(m)
        : m.route === 'timer'
          ? timerPage(m)
          : settingsPage(m)
  return h(
    'div',
    { class: 'app' },
    topbar(m),
    h('main', { class: 'content', key: 'main' }, page),
    editorSheet(m),
    timerSoundSheet(m),
    defaultSoundSheet(m),
    timerAlert(m),
    ringingScreen(m),
  )
}
