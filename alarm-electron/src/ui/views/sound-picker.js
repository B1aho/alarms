/** Sound chooser (ALARM_SPEC §3.8): your music + built-in sounds; a click selects and plays once. */

import { BUILTIN_SOUNDS, S } from '../../domain/strings.js'
import { h } from '../kernel/h.js'
import { importErrorFor, importing } from '../model.js'
import { MusicIcon, PlusIcon } from '../widgets/icons.js'
import { row, section } from '../widgets/row.js'

/** @typedef {import('../model.js').Model} Model */
/** @typedef {import('../model.js').SoundTarget} SoundTarget */
/** @typedef {import('../../contract/commands.js').SoundRef} SoundRef */

/**
 * @param {Model} m
 * @param {SoundRef} value
 * @param {SoundTarget} target
 */
export function soundPicker(m, value, target) {
  const customs = m.app?.sounds ?? []
  const selected = (/** @type {SoundRef} */ ref) => ref.kind === value.kind && ref.id === value.id
  /** @param {SoundRef} sound */
  const choose = (sound) => () => ({ type: 'ChooseSound', target, sound })
  return [
    section(
      { header: S.yourMusicHeader, footer: importErrorFor(m, target) ?? S.soundsFooter, key: 'music' },
      ...customs.map((s) =>
        row({
          key: s.id,
          label: s.name,
          icon: MusicIcon('music-icon'),
          checked: selected({ kind: 'custom', id: s.id }),
          onclick: choose({ kind: 'custom', id: s.id }),
        }),
      ),
      row({
        key: 'choose',
        label: importing(m, target) ? S.adding : S.chooseFile,
        tone: 'accent',
        icon: PlusIcon('add-icon'),
        onclick: () => ({ type: 'ChooseFile', target }),
      }),
    ),
    section(
      { header: S.builtinHeader, key: 'builtin' },
      ...BUILTIN_SOUNDS.map((s) =>
        row({
          key: s.id,
          label: s.name,
          checked: selected({ kind: 'builtin', id: s.id }),
          onclick: choose({ kind: 'builtin', id: s.id }),
        }),
      ),
    ),
  ]
}

/** Keeps the module's `h` import meaningful for pickers rendered standalone. */
export const soundPickerBody = (/** @type {Model} */ m, /** @type {SoundRef} */ value, /** @type {SoundTarget} */ target) =>
  h('div', { class: 'sound-picker' }, soundPicker(m, value, target))
