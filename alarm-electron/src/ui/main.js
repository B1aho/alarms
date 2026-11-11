/** Entry of the `ui` renderer: starts the MVU runtime. */

import { run } from './kernel/runtime.js'
import { init, themeOf } from './model.js'
import { runEffect, startSub, subscriptions, getBus } from './subscriptions.js'
import { update } from './update.js'
import { view } from './views/app.js'
import './widgets/wheel-picker.js'

const root = /** @type {Element} */ (document.getElementById('app'))
const seed = crypto.getRandomValues(new Uint32Array(1))[0]

run({
  root,
  init: init({
    now: Date.now(),
    seed,
    systemDark: matchMedia('(prefers-color-scheme: dark)').matches,
    platform: getBus().platform,
  }),
  update: /** @type {any} */ (update),
  view,
  subscriptions,
  startSub,
  runEffect: /** @type {any} */ (runEffect),
  afterRender: (m) => {
    const theme = themeOf(m)
    if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme
    document.documentElement.dataset.platform = m.platform
    document.documentElement.toggleAttribute('data-ready', m.app !== null)
  },
})
