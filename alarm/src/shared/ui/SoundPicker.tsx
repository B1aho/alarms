import { useEffect, useRef, useState } from 'react'
import { addCustomSound, useCustomSounds } from '../audio/library'
import { startPlayback, type Playback } from '../audio/player'
import { BUILTIN_SOUNDS, type SoundRef } from '../audio/sounds'
import { MusicIcon, PlusIcon } from './Icons'
import { Row, Section } from './list'

/** Sound chooser with preview and "add a music file from this computer". */
export function SoundPicker({
  value,
  onChange,
  volume,
}: {
  value: SoundRef
  onChange: (ref: SoundRef) => void
  volume: number
}) {
  const customs = useCustomSounds()
  const preview = useRef<Playback | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const play = (ref: SoundRef) => {
    preview.current?.stop()
    preview.current = startPlayback(ref, { volume, rampSeconds: 0, loop: false })
  }

  useEffect(() => () => preview.current?.stop(), [])

  const choose = (ref: SoundRef) => {
    onChange(ref)
    play(ref)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const meta = await addCustomSound(file)
      choose({ kind: 'custom', id: meta.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that file.')
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const isSelected = (ref: SoundRef) => ref.kind === value.kind && ref.id === value.id

  return (
    <>
      <Section
        header="Your Music"
        footer={error ?? 'Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported.'}
      >
        {customs.map((s) => {
          const ref: SoundRef = { kind: 'custom', id: s.id }
          return (
            <Row
              key={s.id}
              label={s.name}
              icon={<MusicIcon className="text-[19px] text-ios-indigo" />}
              checked={isSelected(ref)}
              onClick={() => choose(ref)}
            />
          )
        })}
        <Row
          label={busy ? 'Adding…' : 'Choose a File…'}
          tone="accent"
          icon={<PlusIcon className="text-[19px] text-accent" />}
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </Section>
      <Section header="Built-in Sounds">
        {BUILTIN_SOUNDS.map((s) => {
          const ref: SoundRef = { kind: 'builtin', id: s.id }
          return <Row key={s.id} label={s.name} checked={isSelected(ref)} onClick={() => choose(ref)} />
        })}
      </Section>
    </>
  )
}
