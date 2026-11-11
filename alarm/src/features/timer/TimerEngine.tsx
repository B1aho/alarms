import { useEffect } from 'react'
import { formatCountdown } from '@/shared/lib'
import { FilledButton, TimerIcon } from '@/shared/ui'
import { loadTimer, repeatTimer, startTimerEngine, stopTimerRinging, timerLabel, useTimer } from './model/timer'

/** Mounted once at the app root: keeps timers running on every page and shows the "Timer Done" alert. */
export function TimerEngine() {
  const timer = useTimer()

  useEffect(() => {
    void loadTimer().catch((err) => console.error('[timer] load failed', err))
    return startTimerEngine()
  }, [])

  if (timer.status !== 'ringing') return null
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-6 backdrop-blur-md animate-fade-in">
      <div
        role="alertdialog"
        aria-label="Timer done"
        className="elevated w-full max-w-[320px] overflow-hidden rounded-[22px] bg-bg text-center shadow-2xl animate-sheet-in"
      >
        <div className="px-6 pt-7 pb-5">
          <TimerIcon className="mx-auto mb-3 text-[36px] text-accent" />
          <p className="text-[20px] font-semibold">{timerLabel(timer)}</p>
          <p className="tabular mt-1 text-[15px] text-label-2">{formatCountdown(timer.durationMs)} is up</p>
        </div>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <FilledButton autoFocus onClick={() => void stopTimerRinging()}>
            Stop
          </FilledButton>
          <FilledButton tone="gray" onClick={() => void repeatTimer()}>
            Repeat
          </FilledButton>
        </div>
      </div>
    </div>
  )
}
