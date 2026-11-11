/** Modal sheet (ALARM_SPEC §4.3, §4.6): centred card one elevation level up; Esc, Cancel or the backdrop close it. */

import { S } from '../../domain/strings.js'
import { h } from '../kernel/h.js'
import { textButton } from './button.js'
import { ChevronLeftIcon } from './icons.js'

/** @typedef {import('../kernel/h.js').Child} Child */

/**
 * @param {{ label: string, onClose: () => unknown, key?: string }} p
 * @param {...Child} children
 */
export function sheet({ label, onClose, key }, ...children) {
  return h(
    'div',
    { class: 'sheet-layer', key: key ?? 'sheet' },
    h('div', { class: 'sheet-backdrop', onclick: () => onClose() }),
    h(
      'div',
      {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': label,
        tabindex: '-1',
        class: 'sheet elevated',
        mounted: (/** @type {HTMLElement} */ el) => el.focus({ preventScroll: true }),
      },
      ...children,
    ),
  )
}

/** @param {{ leading?: Child, title: Child, trailing?: Child }} p */
export const sheetHeader = ({ leading, title, trailing }) =>
  h(
    'div',
    { class: 'sheet-header' },
    h('div', { class: 'sheet-header-leading' }, leading),
    h('h2', { class: 'sheet-title' }, title),
    h('div', { class: 'sheet-header-trailing' }, trailing),
  )

/** @param {{ key?: string, class?: string }} p @param {...Child} children */
export const sheetBody = ({ key, class: cls }, ...children) =>
  h('div', { class: 'sheet-body', key }, h('div', { class: cls }, ...children))

/** @param {() => unknown} onclick */
export const backButton = (onclick) => textButton({ onclick, class: 'btn-back' }, ChevronLeftIcon('back-chevron'), S.back)
