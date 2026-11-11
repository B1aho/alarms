/** Switch 51 × 31 (ALARM_SPEC §4.4.2). A click never reaches the row under it. */

import { cx, h } from '../kernel/h.js'

/**
 * @param {{ checked: boolean, onChange: (next: boolean) => unknown, label: string, disabled?: boolean }} p
 */
export function switchControl({ checked, onChange, label, disabled }) {
  return h(
    'button',
    {
      type: 'button',
      role: 'switch',
      'aria-checked': String(checked),
      'aria-label': label,
      disabled: Boolean(disabled),
      class: cx('switch', checked && 'is-on'),
      onclick: (/** @type {Event} */ e) => {
        e.stopPropagation()
        return onChange(!checked)
      },
    },
    h('span', { class: 'switch-knob' }),
  )
}
