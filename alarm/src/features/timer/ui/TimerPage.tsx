import { useMemo, useState } from 'react'
import { soundName, useCustomSounds } from '@/shared/audio'
import { formatCountdown, formatTimestamp, useNow, range } from '@/shared/lib'
import { useHourCycle } from '@/shared/settings'
import {
  BellIcon,
  CircleButton,
  PageHeader,
  PlayIcon,
  Row,
  Section,
  Sheet,
  SheetBody,
  SheetHeader,
  SoundPicker,
  TextButton,
  WheelGroup,
  WheelPicker,
  WheelUnit,
} from '@/shared/ui'
import {
  cancelTimer,
  pauseTimer,
  remainingAt,
  removeRecent,
  resumeTimer,
  setTimerDuration,
  setTimerLabel,
  setTimerSound,
  startTimer,
  timerLabel,
  useTimer,
} from '../model/timer'

export function TimerPage() {
  const timer = useTimer()
  const customs = useCustomSounds()
  const [soundOpen, setSoundOpen] = useState(false)
  const active = timer.status === 'running' || timer.status === 'paused'

  return (
    <>
      <PageHeader title="Timer" />

      <div className="flex min-h-[260px] items-center justify-center">
        {active ? <Countdown /> : <DurationWheels durationMs={timer.durationMs} />}
      </div>

      <div className="mt-6 mb-10 flex items-center justify-between px-2">
        <CircleButton tone="gray" disabled={!active} onClick={() => void cancelTimer()}>
          Cancel
        </CircleButton>
        {timer.status === 'running' ? (
          <CircleButton tone="orange" onClick={() => void pauseTimer()}>
            Pause
          </CircleButton>
        ) : timer.status === 'paused' ? (
          <CircleButton tone="green" onClick={() => void resumeTimer()}>
            Resume
          </CircleButton>
        ) : (
          <CircleButton tone="green" onClick={() => void startTimer(timer.durationMs)}>
            Start
          </CircleButton>
        )}
      </div>

      <Section>
        <Row>
          <span className="shrink-0">Label</span>
          <input
            value={timer.label}
            placeholder="Timer"
            maxLength={60}
            onChange={(e) => void setTimerLabel(e.target.value)}
            className="ml-4 min-w-0 flex-1 bg-transparent text-right text-label-2 outline-none placeholder:text-label-3 focus:text-label"
          />
        </Row>
        <Row label="When Timer Ends" detail={soundName(timer.sound, customs)} chevron onClick={() => setSoundOpen(true)} />
      </Section>

      {timer.recents.length > 0 && (
        <Section header="Recents">
          {timer.recents.map((r) => (
            <div key={r.durationMs} className="ios-row group relative flex items-center px-4 py-2.5">
              <div className="flex-1">
                <p className="tabular font-display text-[34px] leading-tight font-light">{formatCountdown(r.durationMs)}</p>
                <p className="text-[13px] text-label-2">{r.label.trim() || describe(r.durationMs)}</p>
              </div>
              <button
                type="button"
                aria-label="Remove from recents"
                onClick={() => void removeRecent(r.durationMs)}
                className="mr-3 text-[13px] text-label-3 opacity-0 transition group-hover:opacity-100 hover:text-ios-red"
              >
                Remove
              </button>
              <button
                type="button"
                aria-label={`Start ${describe(r.durationMs)} timer`}
                onClick={() => void startTimer(r.durationMs, r.label)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ios-green)_22%,transparent)] text-ios-green transition hover:brightness-125"
              >
                <PlayIcon className="ml-0.5 text-[17px]" />
              </button>
            </div>
          ))}
        </Section>
      )}

      <Sheet open={soundOpen} onClose={() => setSoundOpen(false)} label="When Timer Ends">
        <SheetHeader title="When Timer Ends" trailing={<TextButton bold onClick={() => setSoundOpen(false)}>Done</TextButton>} />
        <SheetBody>
          <SoundPicker value={timer.sound} volume={0.9} onChange={(s) => void setTimerSound(s)} />
        </SheetBody>
      </Sheet>
    </>
  )
}

function describe(ms: number) {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(' ')
}

function DurationWheels({ durationMs }: { durationMs: number }) {
  const total = Math.round(durationMs / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const hours = useMemo(() => range(0, 23).map((v) => ({ value: v, label: String(v) })), [])
  const sixty = useMemo(() => range(0, 59).map((v) => ({ value: v, label: String(v) })), [])
  const set = (hh: number, mm: number, ss: number) => void setTimerDuration(Math.max(1, hh * 3600 + mm * 60 + ss) * 1000)
  return (
    <WheelGroup className="w-full max-w-[420px]">
      <WheelPicker label="Hours" items={hours} value={h} onChange={(v) => set(v, m, s)} align="right" width={56} />
      <WheelUnit>hours</WheelUnit>
      <WheelPicker label="Minutes" items={sixty} value={m} onChange={(v) => set(h, v, s)} align="right" width={56} />
      <WheelUnit>min</WheelUnit>
      <WheelPicker label="Seconds" items={sixty} value={s} onChange={(v) => set(h, m, v)} align="right" width={56} />
      <WheelUnit>sec</WheelUnit>
    </WheelGroup>
  )
}

function Countdown() {
  const timer = useTimer()
  const now = useNow(250)
  const cycle = useHourCycle()
  const remaining = remainingAt(timer, now)
  const progress = timer.durationMs > 0 ? remaining / timer.durationMs : 0
  const R = 120
  const C = 2 * Math.PI * R
  const endsAt = timer.status === 'running' && timer.endsAt ? timer.endsAt : now + remaining

  return (
    <div className="relative h-[280px] w-[280px]">
      <svg viewBox="0 0 280 280" className="h-full w-full -rotate-90">
        <circle cx="140" cy="140" r={R} fill="none" stroke="var(--ios-fill-2)" strokeWidth="8" />
        <circle
          cx="140"
          cy="140"
          r={R}
          fill="none"
          stroke="var(--ios-orange)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="mb-1 max-w-[200px] truncate text-[15px] text-label-2">{timerLabel(timer)}</p>
        <p className="tabular font-display text-[58px] leading-none font-light">{formatCountdown(remaining)}</p>
        <p className={`mt-3 flex items-center gap-1 text-[15px] ${timer.status === 'paused' ? 'text-label-3' : 'text-label-2'}`}>
          <BellIcon className="text-[13px]" />
          {formatTimestamp(endsAt, cycle)}
        </p>
      </div>
    </div>
  )
}
