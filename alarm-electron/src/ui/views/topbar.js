/** Top bar (ALARM_SPEC §3.1, §4.3): app badge, section switcher, clock. */

import { formatClock } from '../../domain/format.js'
import { S } from '../../domain/strings.js'
import { cx, h } from '../kernel/h.js'
import { hourCycleOf, nowOf } from '../model.js'
import { ROUTES } from '../keyboard.js'
import { AlarmIcon, GearIcon, StopwatchIcon, TimerIcon } from '../widgets/icons.js'

/** @typedef {import('../model.js').Model} Model */

const ICONS = { alarms: AlarmIcon, stopwatch: StopwatchIcon, timer: TimerIcon, settings: GearIcon }

/** @param {Model} m */
export function topbar(m) {
  const index = ROUTES.indexOf(m.route)
  const d = new Date(nowOf(m))
  const { time, period } = formatClock(d.getHours(), d.getMinutes(), hourCycleOf(m))
  return h(
    'header',
    { class: 'topbar', key: 'topbar' },
    h(
      'div',
      { class: 'topbar-inner' },
      h(
        'div',
        { class: 'topbar-brand' },
        h('span', { class: 'app-badge' }, AlarmIcon()),
        h('span', { class: 'topbar-name' }, S.appName),
      ),
      h(
        'nav',
        { 'aria-label': S.sections, class: 'tabs' },
        h('span', { 'aria-hidden': 'true', class: 'tabs-thumb', style: { transform: `translateX(${index * 100}%)` } }),
        ROUTES.map((r) =>
          h(
            'button',
            {
              key: r,
              type: 'button',
              class: cx('tab', r === m.route && 'is-current'),
              'aria-current': r === m.route ? 'page' : false,
              'data-tab': r,
              onclick: () => ({ type: 'Navigate', route: r }),
            },
            ICONS[r]('tab-icon'),
            h('span', { class: 'tab-label' }, S.tabs[r]),
          ),
        ),
      ),
      h(
        'div',
        { class: 'topbar-clock tabular', 'aria-label': S.currentTime },
        time,
        period ? h('span', { class: 'topbar-period' }, period) : null,
      ),
    ),
  )
}
