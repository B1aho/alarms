/** "Timer done" alert above everything (ALARM_SPEC §3.10, §5.9). */

import { formatCountdown } from '../../../domain/format.js'
import { S, timerLabel } from '../../../domain/strings.js'
import { h } from '../../kernel/h.js'
import { filledButton } from '../../widgets/button.js'
import { TimerIcon } from '../../widgets/icons.js'

/** @param {import('../../model.js').Model} m */
export function timerAlert(m) {
  const t = m.app?.timer
  if (!t || t.status !== 'ringing') return null
  return h(
    'div',
    { class: 'timer-alert-layer', key: 'timer-alert' },
    h(
      'div',
      { role: 'alertdialog', 'aria-label': S.timerDoneAria, class: 'timer-alert elevated' },
      h(
        'div',
        { class: 'timer-alert-body' },
        TimerIcon('timer-alert-icon'),
        h('p', { class: 'timer-alert-title' }, timerLabel(t)),
        h('p', { class: 'timer-alert-text tabular' }, S.isUp(formatCountdown(t.durationMs))),
      ),
      h(
        'div',
        { class: 'timer-alert-buttons' },
        filledButton(
          { mounted: (/** @type {HTMLElement} */ el) => el.focus(), onclick: () => ({ type: 'TimerAlertStop' }) },
          S.stop,
        ),
        filledButton({ tone: 'gray', onclick: () => ({ type: 'TimerAlertRepeat' }) }, S.repeatTimer),
      ),
    ),
  )
}
