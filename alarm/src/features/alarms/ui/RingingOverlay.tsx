import { useEffect, useRef, useState, type FormEvent } from 'react'
import { cn, formatClock, useNow } from '@/shared/lib'
import { useHourCycle, useSettings } from '@/shared/settings'
import { AlarmIcon, FilledButton, TextButton } from '@/shared/ui'
import { displayLabel, type Alarm } from '../model/alarm'
import { dismissAlarm, snoozeAlarm } from '../model/engine'
import { useAlarms } from '../model/store'
import { checkAnswer, generateProblem } from '../model/tasks'

export function RingingOverlay() {
  const { items } = useAlarms()
  const ringing = items.find((a) => a.ringingSince !== null)
  if (!ringing) return null
  return <RingingScreen key={ringing.id} alarm={ringing} />
}

function RingingScreen({ alarm }: { alarm: Alarm }) {
  const cycle = useHourCycle()
  const { snoozeMinutes } = useSettings()
  const now = useNow()
  const [stage, setStage] = useState<'idle' | 'task'>('idle')
  const label = displayLabel(alarm)

  useEffect(() => {
    const previous = document.title
    document.title = `⏰ ${label}`
    return () => {
      document.title = previous
    }
  }, [label])

  const d = new Date(now)
  const { time, period } = formatClock(d.getHours(), d.getMinutes(), cycle)
  const date = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const stop = () => {
    if (alarm.task.type === 'none') void dismissAlarm(alarm.id)
    else setStage('task')
  }

  return (
    <div
      role="alertdialog"
      aria-label={`Alarm: ${label}`}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-y-auto bg-black/85 px-6 py-10 text-white backdrop-blur-2xl animate-fade-in"
      data-theme="dark"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-[62%] rounded-full bg-[radial-gradient(circle,rgba(255,159,10,0.35),transparent_65%)] animate-breathe"
      />

      <div className="relative flex w-full max-w-[420px] flex-col items-center text-center">
        <div className="mb-2 flex items-center gap-2 text-[17px] text-white/70">
          <AlarmIcon className="text-[20px] text-[#FF9F0A]" />
          {label}
        </div>
        <div className="flex items-baseline font-display">
          <span className="tabular text-[108px] leading-none font-extralight tracking-[-0.03em]">{time}</span>
          {period && <span className="ml-2 text-[40px] font-light">{period}</span>}
        </div>
        <p className="mt-2 text-[20px] text-white/70">{date}</p>

        {stage === 'idle' ? (
          <div className="mt-14 flex w-full flex-col gap-3">
            {alarm.snooze && (
              <FilledButton className="h-[60px] w-full rounded-full text-[19px]" autoFocus onClick={() => void snoozeAlarm(alarm.id)}>
                Snooze · {snoozeMinutes} min
              </FilledButton>
            )}
            <button
              type="button"
              autoFocus={!alarm.snooze}
              onClick={stop}
              className="h-[60px] w-full rounded-full bg-white/15 text-[19px] font-semibold text-white backdrop-blur transition hover:bg-white/22 active:scale-[0.98]"
            >
              Stop
            </button>
          </div>
        ) : (
          <TaskCard alarm={alarm} onBack={() => setStage('idle')} />
        )}
      </div>
    </div>
  )
}

function TaskCard({ alarm, onBack }: { alarm: Alarm; onBack: () => void }) {
  const [problem, setProblem] = useState(() => generateProblem(alarm.task))
  const [solved, setSolved] = useState(0)
  const [input, setInput] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [problem])

  if (!problem) return null
  const total = alarm.task.count

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (checkAnswer(problem, input)) {
      const next = solved + 1
      if (next >= total) {
        void dismissAlarm(alarm.id)
        return
      }
      setSolved(next)
    } else {
      setShakeKey((k) => k + 1)
    }
    setProblem(generateProblem(alarm.task))
    setInput('')
  }

  return (
    <form onSubmit={submit} className="mt-12 w-full rounded-[22px] bg-white/10 p-6 backdrop-blur-xl animate-sheet-in">
      <div className="mb-4 flex items-center justify-between text-[15px] text-white/70">
        <span>{problem.kind === 'math' ? 'Solve to turn off' : 'Type the code to turn off'}</span>
        <span className="flex gap-1.5" aria-label={`${solved} of ${total} solved`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cn('h-2 w-2 rounded-full', i < solved ? 'bg-[#30D158]' : 'bg-white/25')} />
          ))}
        </span>
      </div>
      <p key={shakeKey} className={cn('tabular font-display text-[34px] font-medium tracking-wide', shakeKey > 0 && 'animate-shake')}>
        {problem.prompt}
        {problem.kind === 'math' ? ' =' : ''}
      </p>
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        inputMode={problem.kind === 'math' ? 'numeric' : 'text'}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Answer"
        placeholder={problem.kind === 'math' ? 'Answer' : 'Code'}
        className="tabular mt-5 h-14 w-full rounded-[14px] bg-black/35 px-4 text-center text-[26px] tracking-wider text-white uppercase outline-none focus-visible:outline-none placeholder:text-white/30 placeholder:normal-case focus:ring-2 focus:ring-[#FF9F0A]"
      />
      <FilledButton type="submit" className="mt-4 w-full" disabled={!input.trim()}>
        Done
      </FilledButton>
      <TextButton className="mt-3 text-[15px] !text-white/60" onClick={onBack}>
        Back
      </TextButton>
    </form>
  )
}
