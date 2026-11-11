import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width="1em"
      height="1em"
      {...props}
    >
      {children}
    </svg>
  )
}

export const AlarmIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9v4.2l2.6 1.6M4.5 4.8 7 2.8M19.5 4.8 17 2.8M7 20.2l-1.4 1.6M17 20.2l1.4 1.6" />
  </Svg>
)

export const StopwatchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 13.5V9.5M10 2.5h4M12 2.5V6M18.4 6.6l1.3-1.3" />
  </Svg>
)

export const TimerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 1-6.4 2.6" />
    <path d="M12 3v3.5M12 12 8.2 8.2" />
  </Svg>
)

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg strokeWidth={2.4} {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="m14.5 5-7 7 7 7" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const MinusCircleIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" {...p}>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M7 12h10" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
  </svg>
)

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Svg>
)

export const BellIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="currentColor" {...p}>
    <path d="M12 2.5a6 6 0 0 0-6 6v3.6l-1.7 3.2a.8.8 0 0 0 .7 1.2h14a.8.8 0 0 0 .7-1.2L18 12.1V8.5a6 6 0 0 0-6-6Zm-2.6 16a2.7 2.7 0 0 0 5.2 0Z" />
  </svg>
)

export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z" fill="currentColor" stroke="none" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
)

export const MusicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Svg>
)

export const PlayIcon = (p: IconProps) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" fill="currentColor" {...p}>
    <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7Z" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
  </Svg>
)

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </Svg>
)
