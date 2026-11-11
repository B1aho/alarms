import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AlarmEngine } from '@/features/alarms'
import { TimerEngine } from '@/features/timer'
import { audioStateStore } from '@/shared/audio'
import { cn, formatClock, useNow, useStore } from '@/shared/lib'
import { useHourCycle, useSettings } from '@/shared/settings'
import { AlarmIcon, GearIcon, SpeakerIcon, StopwatchIcon, TimerIcon } from '@/shared/ui'

const TABS = [
  { to: '/alarms', label: 'Alarms', Icon: AlarmIcon, key: '1' },
  { to: '/stopwatch', label: 'Stopwatch', Icon: StopwatchIcon, key: '2' },
  { to: '/timer', label: 'Timer', Icon: TimerIcon, key: '3' },
  { to: '/settings', label: 'Settings', Icon: GearIcon, key: '4' },
] as const

export function RootLayout() {
  useThemeSync()
  return (
    <div className="flex min-h-dvh flex-col">
      <Toolbar />
      <AudioLockedBanner />
      <main className="mx-auto w-full max-w-[680px] flex-1 px-4 pt-2 pb-24 sm:px-6">
        <Outlet />
      </main>
      <AlarmEngine />
      <TimerEngine />
    </div>
  )
}

/** macOS-style unified toolbar with a segmented tab switcher (like the Clock app on Mac). */
function Toolbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const index = Math.max(
    0,
    TABS.findIndex((t) => pathname.startsWith(t.to)),
  )
  // ⌘/Ctrl + 1…4 switches tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const tab = TABS.find((t) => t.key === e.key)
      if (!tab) return
      e.preventDefault()
      document.querySelector<HTMLAnchorElement>(`a[data-tab="${tab.to}"]`)?.click()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-separator bg-material backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto grid h-[52px] max-w-[1100px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4">
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-b from-[#ffb340] to-[#ff8a00] text-[16px] text-black shadow-sm">
            <AlarmIcon />
          </span>
          <span className="text-[15px] font-semibold">Alarm</span>
        </div>
        <nav aria-label="Sections" className="relative col-start-2 grid h-8 grid-cols-4 rounded-[9px] bg-fill-2 p-[2px]">
          <span
            aria-hidden
            className="absolute top-[2px] bottom-[2px] left-[2px] w-[calc((100%-4px)/4)] rounded-[7px] bg-thumb shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ transform: `translateX(${index * 100}%)` }}
          />
          {TABS.map(({ to, label, Icon }, i) => (
            <Link
              key={to}
              to={to}
              data-tab={to}
              aria-current={i === index ? 'page' : undefined}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 px-3 text-[13px] sm:px-4',
                i === index ? 'font-semibold' : 'text-label-2 hover:text-label',
              )}
            >
              <Icon className="text-[15px]" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <ToolbarClock />
      </div>
    </header>
  )
}

function ToolbarClock() {
  const now = useNow()
  const cycle = useHourCycle()
  const d = new Date(now)
  const { time, period } = formatClock(d.getHours(), d.getMinutes(), cycle)
  return (
    <div className="tabular hidden justify-self-end text-[15px] text-label-2 sm:block" aria-label="Current time">
      {time}
      {period && <span className="ml-1 text-[12px]">{period}</span>}
    </div>
  )
}

function AudioLockedBanner() {
  const audio = useStore(audioStateStore)
  if (audio !== 'locked') return null
  return (
    <div className="border-b border-separator bg-[color-mix(in_srgb,var(--ios-orange)_14%,var(--ios-bg))] animate-fade-in">
      <button
        type="button"
        className="mx-auto flex w-full max-w-[680px] items-center gap-2 px-6 py-2 text-left text-[13px]"
        onClick={() => {
          /* the click itself unlocks audio */
        }}
      >
        <SpeakerIcon className="shrink-0 text-[16px] text-accent" />
        <span>
          <strong className="font-semibold">Click anywhere to enable alarm sound.</strong>{' '}
          <span className="text-label-2">Browsers need one click after opening. Installed as an app, it can play sound right away.</span>
        </span>
      </button>
    </div>
  )
}

function useThemeSync() {
  const { theme } = useSettings()
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#161617' : '#f6f6f6')
  }, [resolved])
}
