import { useEffect, useMemo, useRef, useState } from 'react'
import { soundName, startPlayback, useCustomSounds, type Playback } from '@/shared/audio'
import { formatDurationShort, type HourCycle, range } from '@/shared/lib'
import { useHourCycle, type Difficulty, type DismissTask, type TaskType } from '@/shared/settings'
import {
  BackButton,
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
  WheelGroup,
  WheelPicker,
} from '@/shared/ui'
import { DEFAULT_LABEL, type Alarm } from '../model/alarm'
import { DAY_LONG, WEEK_ORDER, repeatSummary } from '../model/schedule'
import { deleteAlarm, saveAlarm } from '../model/store'
import { generateProblem, taskSummary } from '../model/tasks'

type Page = 'main' | 'repeat' | 'sound' | 'ramp' | 'task'

const RAMP_OPTIONS = [0, 15, 30, 60, 120, 300, 600]

export function AlarmEditor({ alarm, isNew, onClose }: { alarm: Alarm; isNew: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(alarm)
  const [page, setPage] = useState<Page>('main')
  const cycle = useHourCycle()
  const customs = useCustomSounds()
  const set = (patch: Partial<Alarm>) => setDraft((d) => ({ ...d, ...patch }))
  const back = () => setPage('main')

  const save = () => {
    // The store updates synchronously, so the sheet can close right away.
    void saveAlarm({ ...draft, enabled: true }).catch((err) => console.error('[alarms] save failed', err))
    onClose()
  }

  const titles: Record<Page, string> = {
    main: isNew ? 'Add Alarm' : 'Edit Alarm',
    repeat: 'Repeat',
    sound: 'Sound',
    ramp: 'Gradual Volume',
    task: 'Turn Off With',
  }

  return (
    <Sheet open onClose={onClose} label={titles.main}>
      <SheetHeader
        leading={page === 'main' ? <TextButton onClick={onClose}>Cancel</TextButton> : <BackButton onClick={back} />}
        title={titles[page]}
        trailing={
          page === 'main' ? (
            <TextButton bold onClick={() => void save()}>
              Save
            </TextButton>
          ) : null
        }
      />
      <SheetBody>
        <div key={page} className={page === 'main' ? undefined : 'animate-push-in'}>
          {page === 'main' && (
            <>
              <TimeWheels hour={draft.hour} minute={draft.minute} cycle={cycle} onChange={(hour, minute) => set({ hour, minute })} />

              <Section className="mt-6">
                <Row label="Repeat" detail={repeatSummary(draft.days)} chevron onClick={() => setPage('repeat')} />
                <Row label="Label">
                  <span className="shrink-0">Label</span>
                  <input
                    value={draft.label}
                    maxLength={60}
                    placeholder={DEFAULT_LABEL}
                    onChange={(e) => set({ label: e.target.value })}
                    className="ml-4 min-w-0 flex-1 bg-transparent text-right text-label-2 outline-none placeholder:text-label-3 focus:text-label"
                  />
                </Row>
                <Row label="Sound" detail={soundName(draft.sound, customs)} chevron onClick={() => setPage('sound')} />
                <Row label="Snooze" accessory={<Switch checked={draft.snooze} label="Snooze" onChange={(snooze) => set({ snooze })} />} />
              </Section>

              <Section header="Volume" footer="Starts almost silent and rises smoothly to the set volume.">
                <Row>
                  <SpeakerIcon className="mr-3 shrink-0 text-[15px] text-label-2" />
                  <Slider label="Alarm volume" min={0.05} max={1} step={0.05} value={draft.volume} onChange={(volume) => set({ volume })} />
                  <SpeakerIcon className="ml-3 shrink-0 text-[20px] text-label-2" />
                </Row>
                <Row
                  label="Gradual Volume"
                  detail={formatDurationShort(draft.rampSeconds)}
                  chevron
                  onClick={() => setPage('ramp')}
                />
                <PreviewRow alarm={draft} />
              </Section>

              <Section header="Turn Off" footer="The alarm keeps ringing until the task is solved. Snooze never needs a task.">
                <Row label="Turn Off With" detail={taskSummary(draft.task)} chevron onClick={() => setPage('task')} />
              </Section>


              {!isNew && (
                <Section>
                  <Row
                    label="Delete Alarm"
                    tone="red"
                    className="justify-center"
                    onClick={() => {
                      void deleteAlarm(alarm.id)
                      onClose()
                    }}
                  />
                </Section>
              )}
            </>
          )}

          {page === 'repeat' && (
            <Section>
              {WEEK_ORDER.map((d) => (
                <Row
                  key={d}
                  label={`Every ${DAY_LONG[d]}`}
                  checked={draft.days.includes(d)}
                  onClick={() =>
                    set({ days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort() })
                  }
                />
              ))}
            </Section>
          )}

          {page === 'sound' && (
            <SoundPicker value={draft.sound} volume={draft.volume} onChange={(sound) => set({ sound })} />
          )}

          {page === 'ramp' && (
            <Section footer="How long it takes to reach full volume.">
              {RAMP_OPTIONS.map((s) => (
                <Row
                  key={s}
                  label={formatDurationShort(s)}
                  checked={draft.rampSeconds === s}
                  onClick={() => set({ rampSeconds: s })}
                />
              ))}
            </Section>
          )}

          {page === 'task' && <TaskPage task={draft.task} onChange={(task) => set({ task })} />}

        </div>
      </SheetBody>
    </Sheet>
  )
}

// --------------------------------------------------------------------------

function TimeWheels({
  hour,
  minute,
  cycle,
  onChange,
}: {
  hour: number
  minute: number
  cycle: HourCycle
  onChange: (hour: number, minute: number) => void
}) {
  const minutes = useMemo(() => range(0, 59).map((m) => ({ value: m, label: String(m).padStart(2, '0') })), [])
  const hours24 = useMemo(() => range(0, 23).map((h) => ({ value: h, label: String(h).padStart(2, '0') })), [])
  const hours12 = useMemo(() => range(1, 12).map((h) => ({ value: h, label: String(h) })), [])
  const periods = [
    { value: 'AM', label: 'AM' },
    { value: 'PM', label: 'PM' },
  ] as const

  if (cycle === '24h') {
    return (
      <WheelGroup>
        <WheelPicker label="Hour" items={hours24} value={hour} onChange={(h) => onChange(h, minute)} align="right" width={72} />
        <span className="relative z-10 text-[23px]">:</span>
        <WheelPicker label="Minute" items={minutes} value={minute} onChange={(m) => onChange(hour, m)} align="left" width={72} />
      </WheelGroup>
    )
  }

  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const period = hour < 12 ? 'AM' : 'PM'
  const to24 = (h: number, p: string) => (h % 12) + (p === 'PM' ? 12 : 0)
  return (
    <WheelGroup>
      <WheelPicker label="Hour" items={hours12} value={h12} onChange={(h) => onChange(to24(h, period), minute)} align="right" width={64} />
      <span className="relative z-10 text-[23px]">:</span>
      <WheelPicker label="Minute" items={minutes} value={minute} onChange={(m) => onChange(hour, m)} align="left" width={64} />
      <WheelPicker label="AM or PM" items={periods} value={period} onChange={(p) => onChange(to24(h12, p), minute)} width={64} />
    </WheelGroup>
  )
}

function PreviewRow({ alarm }: { alarm: Alarm }) {
  const [playing, setPlaying] = useState(false)
  const ref = useRef<Playback | null>(null)
  useEffect(() => () => ref.current?.stop(), [])
  const toggle = () => {
    if (playing) {
      ref.current?.stop()
      setPlaying(false)
    } else {
      ref.current = startPlayback(alarm.sound, { volume: alarm.volume, rampSeconds: alarm.rampSeconds })
      setPlaying(true)
    }
  }
  return <Row label={playing ? 'Stop Preview' : 'Preview Wake-up'} tone="accent" onClick={toggle} />
}

function TaskPage({ task, onChange }: { task: DismissTask; onChange: (t: DismissTask) => void }) {
  const example = useMemo(() => generateProblem(task), [task])
  return (
    <>
      <Section>
        <div className="p-3">
          <SegmentedControl<TaskType>
            label="Task type"
            value={task.type}
            onChange={(type) => onChange({ ...task, type })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'math', label: 'Math' },
              { value: 'retype', label: 'Retype Code' },
            ]}
          />
        </div>
      </Section>
      {task.type !== 'none' && (
        <>
          <Section header="Difficulty">
            <div className="p-3">
              <SegmentedControl<Difficulty>
                label="Difficulty"
                value={task.difficulty}
                onChange={(difficulty) => onChange({ ...task, difficulty })}
                options={[
                  { value: 'easy', label: 'Easy' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'hard', label: 'Hard' },
                ]}
              />
            </div>
            <Row
              label={`${task.count} ${task.count === 1 ? 'task' : 'tasks'} in a row`}
              accessory={
                <Stepper label="Number of tasks" value={task.count} min={1} max={5} onChange={(count) => onChange({ ...task, count })} />
              }
            />
          </Section>
          {example && (
            <Section header="Example">
              <div className="px-4 py-5 text-center">
                <p className="tabular font-display text-[28px] font-medium tracking-wide">
                  {example.prompt}
                  {example.kind === 'math' ? ' = ?' : ''}
                </p>
              </div>
            </Section>
          )}
        </>
      )}
    </>
  )
}
