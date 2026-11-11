/** Line icons in the SF Symbols style (ALARM_SPEC §4.4.9): stroke 1.8, round caps, 1em. */

import { h } from '../kernel/h.js'

/**
 * @param {string | undefined} cls
 * @param {import('../kernel/h.js').Child[]} children
 * @param {Record<string, any>} [extra]
 */
const svg = (cls, children, extra = {}) =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      width: '1em',
      height: '1em',
      class: cls ? `icon ${cls}` : 'icon',
      ...extra,
    },
    ...children,
  )

const path = (/** @type {string} */ d, /** @type {Record<string, any>} */ extra = {}) => h('path', { d, ...extra })

/** @param {string} [cls] */
export const AlarmIcon = (cls) =>
  svg(cls, [
    h('circle', { cx: '12', cy: '13', r: '7.5' }),
    path('M12 9v4.2l2.6 1.6M4.5 4.8 7 2.8M19.5 4.8 17 2.8M7 20.2l-1.4 1.6M17 20.2l1.4 1.6'),
  ])
/** @param {string} [cls] */
export const StopwatchIcon = (cls) =>
  svg(cls, [h('circle', { cx: '12', cy: '13.5', r: '7.5' }), path('M12 13.5V9.5M10 2.5h4M12 2.5V6M18.4 6.6l1.3-1.3')])
/** @param {string} [cls] */
export const TimerIcon = (cls) => svg(cls, [path('M12 3a9 9 0 1 1-6.4 2.6'), path('M12 3v3.5M12 12 8.2 8.2')])
/** @param {string} [cls] */
export const GearIcon = (cls) =>
  svg(cls, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    path(
      'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
    ),
  ])
/** @param {string} [cls] */
export const PlusIcon = (cls) => svg(cls, [path('M12 5v14M5 12h14')], { 'stroke-width': '2.2' })
/** @param {string} [cls] */
export const ChevronRightIcon = (cls) => svg(cls, [path('m9.5 6 6 6-6 6')], { 'stroke-width': '2.4' })
/** @param {string} [cls] */
export const ChevronLeftIcon = (cls) => svg(cls, [path('m14.5 5-7 7 7 7')], { 'stroke-width': '2.6' })
/** @param {string} [cls] */
export const CheckIcon = (cls) => svg(cls, [path('m5 12.5 4.5 4.5L19 7.5')], { 'stroke-width': '2.6' })
/** @param {string} [cls] */
export const MinusCircleIcon = (cls) =>
  h(
    'svg',
    { viewBox: '0 0 24 24', width: '1em', height: '1em', 'aria-hidden': 'true', class: cls ? `icon ${cls}` : 'icon' },
    h('circle', { cx: '12', cy: '12', r: '10', fill: 'currentColor' }),
    h('path', { d: 'M7 12h10', stroke: '#fff', 'stroke-width': '2.4', 'stroke-linecap': 'round' }),
  )
/** @param {string} [cls] */
export const BellIcon = (cls) =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      'aria-hidden': 'true',
      fill: 'currentColor',
      class: cls ? `icon ${cls}` : 'icon',
    },
    h('path', {
      d: 'M12 2.5a6 6 0 0 0-6 6v3.6l-1.7 3.2a.8.8 0 0 0 .7 1.2h14a.8.8 0 0 0 .7-1.2L18 12.1V8.5a6 6 0 0 0-6-6Zm-2.6 16a2.7 2.7 0 0 0 5.2 0Z',
    }),
  )
/** @param {string} [cls] */
export const SpeakerIcon = (cls) =>
  svg(cls, [
    path('M4 9.5h3.5L12 5.5v13l-4.5-4H4Z', { fill: 'currentColor', stroke: 'none' }),
    path('M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11'),
  ])
/** @param {string} [cls] */
export const MusicIcon = (cls) =>
  svg(cls, [
    path('M9 18V5.5l11-2V16'),
    h('circle', { cx: '6.5', cy: '18', r: '2.5' }),
    h('circle', { cx: '17.5', cy: '16', r: '2.5' }),
  ])
/** @param {string} [cls] */
export const PlayIcon = (cls) =>
  h(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: '1em',
      height: '1em',
      'aria-hidden': 'true',
      fill: 'currentColor',
      class: cls ? `icon ${cls}` : 'icon',
    },
    h('path', { d: 'M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7Z' }),
  )
/** @param {string} [cls] */
export const TrashIcon = (cls) => svg(cls, [path('M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5')])
