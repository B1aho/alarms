/** Grouped list: section, row variants (ALARM_SPEC §4.4.7), page header, banner (§4.4.8). */

import { cx, h } from '../kernel/h.js'
import { CheckIcon, ChevronRightIcon } from './icons.js'

/** @typedef {import('../kernel/h.js').Child} Child */

/**
 * Inset grouped section.
 * @param {{ header?: string, footer?: Child, class?: string, key?: string }} p
 * @param {...Child} children
 */
export function section({ header, footer, class: cls, key }, ...children) {
  return h(
    'section',
    { class: cx('section', cls), key },
    header ? h('h2', { class: 'section-header' }, header) : null,
    h('div', { class: 'section-body' }, ...children),
    footer ? h('p', { class: 'section-footer' }, footer) : null,
  )
}

/**
 * @typedef {object} RowProps
 * @property {Child} [label]
 * @property {Child} [detail]
 * @property {Child} [icon]
 * @property {(e: Event) => unknown} [onclick]
 * @property {boolean} [chevron]
 * @property {boolean} [checked]
 * @property {Child} [accessory]
 * @property {'label' | 'accent' | 'red'} [tone]
 * @property {string} [class]
 * @property {string | number} [key]
 * @property {Record<string, any>} [attrs]
 */

/**
 * @param {RowProps} p
 * @param {...Child} children replaces the label
 */
export function row(p, ...children) {
  const content = [
    p.icon ? h('span', { class: 'row-icon' }, p.icon) : null,
    children.length ? children : h('span', { class: cx('row-label', p.tone && p.tone !== 'label' && `tone-${p.tone}`) }, p.label),
    p.detail !== undefined && p.detail !== null ? h('span', { class: 'row-detail' }, p.detail) : null,
    p.accessory ? h('span', { class: 'row-accessory' }, p.accessory) : null,
    p.checked ? CheckIcon('row-check') : null,
    p.chevron ? ChevronRightIcon('row-chevron') : null,
  ]
  if (p.onclick) {
    return h(
      'button',
      { type: 'button', key: p.key, class: cx('row', 'row-button', p.class), onclick: p.onclick, ...p.attrs },
      ...content,
    )
  }
  return h('div', { key: p.key, class: cx('row', p.class), ...p.attrs }, ...content)
}

/**
 * Large-title page header.
 * @param {{ title: string, leading?: Child, trailing?: Child, subtitle?: Child }} p
 */
export function pageHeader({ title, leading, trailing, subtitle }) {
  return h(
    'header',
    { class: 'page-header' },
    h(
      'div',
      { class: 'page-actions' },
      h('div', { class: 'page-actions-side' }, leading),
      h('div', { class: 'page-actions-side' }, trailing),
    ),
    h('h1', { class: 'page-title' }, title),
    subtitle !== undefined && subtitle !== null ? h('p', { class: 'page-subtitle' }, subtitle) : null,
  )
}

/**
 * @param {{ icon: Child, title: string, text?: string, action?: Child }} p
 */
export function banner({ icon, title, text, action }) {
  return h(
    'div',
    { class: 'banner', role: 'status' },
    h('span', { class: 'banner-icon' }, icon),
    h(
      'div',
      { class: 'banner-body' },
      h('p', { class: 'banner-title' }, title),
      text ? h('p', { class: 'banner-text' }, text) : null,
    ),
    action ? h('div', { class: 'banner-action' }, action) : null,
  )
}
