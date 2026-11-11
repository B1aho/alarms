/** Buttons (ALARM_SPEC §4.4.5): link, filled, round iOS Clock, and the `+` icon button. */

import { cx, h } from '../kernel/h.js'
import { PlusIcon } from './icons.js'

/** @typedef {import('../kernel/h.js').Child} Child */
/** @typedef {(e: Event) => unknown} Handler */

/**
 * @param {{ onclick?: Handler, bold?: boolean, tone?: 'accent' | 'red' | 'label', class?: string, disabled?: boolean, [k: string]: any }} p
 * @param {...Child} children
 */
export function textButton({ bold, tone = 'accent', class: cls, ...rest }, ...children) {
  return h('button', { type: 'button', class: cx('btn-link', `tone-${tone}`, bold && 'bold', cls), ...rest }, ...children)
}

/**
 * @param {{ onclick?: Handler, tone?: 'accent' | 'gray' | 'red' | 'indigo', class?: string, disabled?: boolean, [k: string]: any }} p
 * @param {...Child} children
 */
export function filledButton({ tone = 'accent', class: cls, ...rest }, ...children) {
  return h('button', { type: rest.type ?? 'button', class: cx('btn-filled', `fill-${tone}`, cls), ...rest }, ...children)
}

/**
 * The round Start/Stop/Lap buttons of the iOS Clock app.
 * @param {{ onclick?: Handler, tone: 'green' | 'red' | 'gray' | 'orange', disabled?: boolean, title?: string, [k: string]: any }} p
 * @param {...Child} children
 */
export function circleButton({ tone, class: cls, ...rest }, ...children) {
  return h(
    'button',
    { type: 'button', class: cx('btn-circle', `circle-${tone}`, cls), ...rest },
    h('span', { class: 'btn-circle-ring' }),
    ...children,
  )
}

/** @param {{ onclick: Handler, label: string }} p */
export const plusButton = ({ onclick, label }) =>
  h('button', { type: 'button', class: 'btn-plus', 'aria-label': label, title: label, onclick }, PlusIcon())
