import { useEffect } from 'react'
import { cn, formatStopwatch, useFrameNow } from '@/shared/lib'
import { CircleButton, PageHeader } from '@/shared/ui'
import {
  elapsedAt,
  lapRows,
  lapStopwatch,
  loadStopwatch,
  resetStopwatch,
  startStopwatch,
  stopStopwatch,
  useStopwatch,
} from '../model/stopwatch'

export function StopwatchPage() {
  const sw = useStopwatch()
  const running = sw.startedAt !== null
  const now = useFrameNow(running)
  const elapsed = elapsedAt(sw, now)
  const { current, completed } = lapRows(sw, now)

  useEffect(() => {
    void loadStopwatch()
  }, [])

  // Space = start/stop, L = lap/reset — handy on a desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (running) stopStopwatch()
        else startStopwatch()
      } else if (e.key.toLowerCase() === 'l') {
        if (running) lapStopwatch()
        else if (elapsed > 0) resetStopwatch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, elapsed])

  return (
    <>
      <PageHeader title="Stopwatch" />
      <div className="flex h-[220px] items-center justify-center">
        <p className="tabular font-display text-[clamp(64px,13vw,96px)] leading-none font-extralight tracking-[-0.02em]">
          {formatStopwatch(elapsed)}
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between px-2">
        {running ? (
          <CircleButton tone="gray" onClick={lapStopwatch} title="Lap (L)">
            Lap
          </CircleButton>
        ) : (
          <CircleButton tone="gray" disabled={elapsed === 0} onClick={resetStopwatch} title="Reset (L)">
            Reset
          </CircleButton>
        )}
        {running ? (
          <CircleButton tone="red" onClick={stopStopwatch} title="Stop (Space)">
            Stop
          </CircleButton>
        ) : (
          <CircleButton tone="green" onClick={startStopwatch} title="Start (Space)">
            Start
          </CircleButton>
        )}
      </div>

      {(elapsed > 0 || completed.length > 0) && (
        <ul className="border-t border-separator">
          <LapRow n={current.n} ms={current.ms} />
          {completed.map((l) => (
            <LapRow key={l.n} n={l.n} ms={l.ms} tone={l.best ? 'best' : l.worst ? 'worst' : undefined} />
          ))}
        </ul>
      )}
    </>
  )
}

function LapRow({ n, ms, tone }: { n: number; ms: number; tone?: 'best' | 'worst' }) {
  return (
    <li
      className={cn(
        'flex h-11 items-center justify-between border-b border-separator px-1 text-[17px]',
        tone === 'best' && 'text-ios-green',
        tone === 'worst' && 'text-ios-red',
      )}
    >
      <span>Lap {n}</span>
      <span className="tabular">{formatStopwatch(ms)}</span>
    </li>
  )
}
