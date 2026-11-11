import { useRef, useState, type ReactNode } from 'react'
import { addCustomSound, removeCustomSound, soundName, useCustomSounds, audioStateStore } from '@/shared/audio'
import { formatDurationShort, useStore } from '@/shared/lib'
import { requestNotifyPermission, useNotifyPermission } from '@/shared/notify'
import { updateSettings, useSettings, type Difficulty, type Settings, type TaskType } from '@/shared/settings'
import {
  FilledButton,
  MusicIcon,
  PageHeader,
  PlusIcon,
  Row,
  Section,
  SegmentedControl,
  Sheet,
  SheetBody,
  SheetHeader,
  Slider,
  SoundPicker,
  SpeakerIcon,
  Stepper,
  Switch,
  TextButton,
  TrashIcon,
} from '@/shared/ui'

const RAMP_OPTIONS = [0, 15, 30, 60, 120, 300, 600]
const GRACE_OPTIONS = [5, 15, 30, 60, 120, 240]

export function SettingsPage() {
  const s = useSettings()
  const customs = useCustomSounds()
  const [soundOpen, setSoundOpen] = useState(false)
  const set = (patch: Partial<Settings>) => void updateSettings(patch)

  return (
    <>
      <PageHeader title="Settings" />

      <Section header="Appearance">
        <Row label="Theme">
          <span className="flex-1">Theme</span>
          <SegmentedControl
            className="w-[220px]"
            label="Theme"
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row>
          <span className="flex-1">Time Format</span>
          <SegmentedControl
            className="w-[220px]"
            label="Time format"
            value={s.hourCycle}
            onChange={(hourCycle) => set({ hourCycle })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: '12h', label: '12-hour' },
              { value: '24h', label: '24-hour' },
            ]}
          />
        </Row>
      </Section>

      <Section header="New Alarm Defaults" footer="Applied to alarms you create from now on. Each alarm can still be changed individually.">
        <Row label="Sound" detail={soundName(s.defaultSound, customs)} chevron onClick={() => setSoundOpen(true)} />
        <Row>
          <SpeakerIcon className="mr-3 shrink-0 text-[15px] text-label-2" />
          <Slider label="Default volume" min={0.05} max={1} step={0.05} value={s.volume} onChange={(volume) => set({ volume })} />
          <SpeakerIcon className="ml-3 shrink-0 text-[20px] text-label-2" />
        </Row>
        <SelectRow
          label="Gradual Volume"
          value={s.rampSeconds}
          options={RAMP_OPTIONS.map((v) => ({ value: v, label: formatDurationShort(v) }))}
          onChange={(rampSeconds) => set({ rampSeconds })}
        />
        <Row>
          <span className="flex-1">Turn Off With</span>
          <SegmentedControl<TaskType>
            className="w-[240px]"
            label="Default dismissal task"
            value={s.defaultTask.type}
            onChange={(type) => set({ defaultTask: { ...s.defaultTask, type } })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'math', label: 'Math' },
              { value: 'retype', label: 'Code' },
            ]}
          />
        </Row>
        {s.defaultTask.type !== 'none' && (
          <>
            <Row>
              <span className="flex-1">Difficulty</span>
              <SegmentedControl<Difficulty>
                className="w-[240px]"
                label="Default difficulty"
                value={s.defaultTask.difficulty}
                onChange={(difficulty) => set({ defaultTask: { ...s.defaultTask, difficulty } })}
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'hard', label: 'Hard' },
                ]}
              />
            </Row>
            <Row
              label={`${s.defaultTask.count} ${s.defaultTask.count === 1 ? 'task' : 'tasks'} in a row`}
              accessory={
                <Stepper
                  label="Default task count"
                  value={s.defaultTask.count}
                  min={1}
                  max={5}
                  onChange={(count) => set({ defaultTask: { ...s.defaultTask, count } })}
                />
              }
            />
          </>
        )}
      </Section>

      <Section header="Snooze">
        <Row
          label={`Snooze Length · ${s.snoozeMinutes} min`}
          accessory={<Stepper label="Snooze minutes" value={s.snoozeMinutes} min={1} max={30} onChange={(snoozeMinutes) => set({ snoozeMinutes })} />}
        />
      </Section>


      <ReliabilitySection settings={s} />
      <MusicLibrary />

      <Section header="About">
        <Row label="Version" detail={__APP_VERSION__} />
        <Row label="Storage" detail="This computer only" />
      </Section>

      <Sheet open={soundOpen} onClose={() => setSoundOpen(false)} label="Default sound">
        <SheetHeader title="Default Sound" trailing={<TextButton bold onClick={() => setSoundOpen(false)}>Done</TextButton>} />
        <SheetBody>
          <SoundPicker value={s.defaultSound} volume={s.volume} onChange={(defaultSound) => set({ defaultSound })} />
        </SheetBody>
      </Sheet>
    </>
  )
}

function SelectRow<T extends number | string>({
  label,
  value,
  options,
  onChange,
}: {
  label: ReactNode
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <Row>
      <span className="flex-1">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked) onChange(picked.value)
        }}
        className="cursor-pointer rounded-md bg-transparent py-0.5 text-right text-label-2 outline-none hover:text-label"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  )
}

function ReliabilitySection({ settings: s }: { settings: Settings }) {
  const permission = useNotifyPermission()
  const audio = useStore(audioStateStore)
  const set = (patch: Partial<Settings>) => void updateSettings(patch)
  const status = (ok: boolean, text: string) => <span className={ok ? 'text-ios-green' : 'text-ios-orange'}>{text}</span>

  return (
    <Section
      header="Reliability"
      footer={
        <>
          This is a web app: it rings while its window or tab is open — minimised, hidden or behind other windows is fine, and
          the screen may be locked. It cannot ring while the browser is fully quit or the computer is asleep. For the best
          results install it as an app (browser menu → Install), keep it running, and turn on “Keep Computer Awake”.
        </>
      }
    >
      <Row
        label="Notifications"
        detail={
          permission === 'granted'
            ? status(true, 'On')
            : permission === 'denied'
              ? status(false, 'Blocked in browser')
              : permission === 'unsupported'
                ? status(false, 'Unsupported')
                : undefined
        }
        accessory={
          permission === 'default' ? (
            <FilledButton className="h-8 rounded-full px-4 text-[15px]" onClick={() => void requestNotifyPermission()}>
              Turn On
            </FilledButton>
          ) : undefined
        }
      />
      <Row label="Alarm Sound" detail={audio === 'running' ? status(true, 'Ready') : status(false, audio === 'locked' ? 'Click anywhere to enable' : 'Unsupported')} />
      <Row
        label="Keep Computer Awake"
        accessory={<Switch checked={s.keepAwake} label="Keep computer awake while alarms are on" onChange={(keepAwake) => set({ keepAwake })} />}
      />
      <SelectRow
        label="Ring Late Alarms For"
        value={s.missedGraceMinutes}
        options={GRACE_OPTIONS.map((v) => ({ value: v, label: v < 60 ? `${v} min` : `${v / 60} hr` }))}
        onChange={(missedGraceMinutes) => set({ missedGraceMinutes })}
      />
    </Section>
  )
}

function MusicLibrary() {
  const customs = useCustomSounds()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const add = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await addCustomSound(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that file.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <Section header="Your Music" footer={error ?? 'Imported files are copied into the app’s local storage, so alarms keep working if the original is moved.'}>
      {customs.map((c) => (
        <Row
          key={c.id}
          icon={<MusicIcon className="text-[19px] text-ios-indigo" />}
          label={c.name}
          detail={`${(c.size / 1024 / 1024).toFixed(1)} MB`}
          accessory={
            <button
              type="button"
              aria-label={`Delete ${c.name}`}
              className="text-[18px] text-label-3 transition hover:text-ios-red"
              onClick={() => void removeCustomSound(c.id)}
            >
              <TrashIcon />
            </button>
          }
        />
      ))}
      <Row
        tone="accent"
        icon={<PlusIcon className="text-[19px] text-accent" />}
        label={busy ? 'Adding…' : 'Add Music File…'}
        onClick={() => input.current?.click()}
      />
      <input
        ref={input}
        type="file"
        hidden
        accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac"
        onChange={(e) => void add(e.target.files?.[0])}
      />
    </Section>
  )
}
