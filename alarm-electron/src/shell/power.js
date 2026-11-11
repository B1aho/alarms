/**
 * Keep Computer Awake (TZ §3.7): blocks system sleep (`prevent-app-suspension`), the screen may still turn off.
 */

import { powerSaveBlocker } from 'electron'

export function createPower() {
  /** @type {number | null} */
  let id = null
  return {
    /** @param {boolean} on */
    set(on) {
      if (on && id === null) id = powerSaveBlocker.start('prevent-app-suspension')
      if (!on && id !== null) {
        powerSaveBlocker.stop(id)
        id = null
      }
    },
    isOn: () => id !== null && powerSaveBlocker.isStarted(id),
  }
}
