/** Stepper (ALARM_SPEC §4.4.3): − | + halves, disabled at the range ends. */

import { S } from '../../domain/strings.js'
import { h } from '../kernel/h.js'

/**
 * @param {{ value: number, min: number, max: number, onChange: (v: number) => unknown, label: string }} p
 */
export function stepper({ value, min, max, onChange, label }) {
  return h(
    'div',
    { role: 'group', 'aria-label': label, class: 'stepper' },
    h(
      'button',
      {
        type: 'button',
        class: 'stepper-btn',
        disabled: value <= min,
        'aria-label': S.decrease,
        onclick: () => onChange(value - 1),
      },
      '−',
    ),
    h('span', { class: 'stepper-divider' }),
    h(
      'button',
      {
        type: 'button',
        class: 'stepper-btn',
        disabled: value >= max,
        'aria-label': S.increase,
        onclick: () => onChange(value + 1),
      },
      '+',
    ),
  )
}
