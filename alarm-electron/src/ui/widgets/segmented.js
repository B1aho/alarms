/** Segmented control (ALARM_SPEC §4.4.1): radio group with a sliding thumb. */

import { cx, h } from '../kernel/h.js'

/**
 * @template {string} T
 * @param {{ options: ReadonlyArray<{ value: T, label: string }>, value: T, onChange: (v: T) => unknown, label: string, class?: string }} p
 */
export function segmented({ options, value, onChange, label, class: cls }) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return h(
    'div',
    {
      role: 'radiogroup',
      'aria-label': label,
      class: cx('segmented', cls),
      style: { 'grid-template-columns': `repeat(${options.length}, minmax(0, 1fr))` },
    },
    h('span', {
      'aria-hidden': 'true',
      class: 'segmented-thumb',
      style: { width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` },
    }),
    options.map((o) =>
      h(
        'button',
        {
          key: o.value,
          type: 'button',
          role: 'radio',
          'aria-checked': String(o.value === value),
          class: cx('segmented-option', o.value === value && 'is-selected'),
          onclick: () => onChange(o.value),
        },
        o.label,
      ),
    ),
  )
}
