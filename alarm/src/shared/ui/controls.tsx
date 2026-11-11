import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { cn } from '../lib/cn'

// ------------------------------------------------------------------ Switch --

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={cn(
        'relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-ios-green' : 'bg-[var(--ios-switch-off)]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
          checked && 'translate-x-[20px]',
        )}
      />
    </button>
  )
}

// -------------------------------------------------------- SegmentedControl --

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>
  value: T
  onChange: (v: T) => void
  label: string
  className?: string
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('relative grid h-8 rounded-[9px] bg-fill-2 p-[2px] text-[13px]', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute top-[2px] bottom-[2px] left-[2px] rounded-[7px] bg-thumb shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 truncate px-2 font-medium transition-opacity',
            o.value === value ? 'font-semibold' : 'opacity-90 hover:opacity-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ Slider --

export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  label: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      aria-label={label}
      className="ios-slider w-full cursor-pointer"
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ '--fill': `${pct}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

// ----------------------------------------------------------------- Stepper --

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
}) {
  const btn =
    'flex h-8 w-[47px] items-center justify-center text-[20px] leading-none transition-colors hover:bg-fill disabled:opacity-30'
  return (
    <div role="group" aria-label={label} className="flex h-8 overflow-hidden rounded-lg bg-fill-2">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Decrease">
        −
      </button>
      <span className="my-1.5 w-px bg-separator" />
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Increase">
        +
      </button>
    </div>
  )
}

// ------------------------------------------------------------ Text buttons --

export function TextButton({
  className,
  bold,
  tone = 'accent',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { bold?: boolean; tone?: 'accent' | 'red' | 'label' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1 rounded-md text-[17px] transition-opacity hover:opacity-70 active:opacity-50 disabled:opacity-30',
        tone === 'accent' && 'text-accent',
        tone === 'red' && 'text-ios-red',
        tone === 'label' && 'text-label',
        bold && 'font-semibold',
        className,
      )}
      {...props}
    />
  )
}

/** Large filled button (iOS "borderedProminent"). */
export function FilledButton({
  className,
  tone = 'accent',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'accent' | 'gray' | 'red' | 'indigo' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-[50px] items-center justify-center gap-2 rounded-[14px] px-6 text-[17px] font-semibold transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:opacity-40',
        tone === 'accent' && 'bg-accent text-black',
        tone === 'gray' && 'bg-fill text-label',
        tone === 'red' && 'bg-ios-red text-white',
        tone === 'indigo' && 'bg-ios-indigo text-white',
        className,
      )}
      {...props}
    />
  )
}

/** The round Start/Stop/Lap buttons from the iOS Clock app. */
export function CircleButton({
  tone,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone: 'green' | 'red' | 'gray' | 'orange' }) {
  const tones = {
    green: 'text-ios-green bg-[color-mix(in_srgb,var(--ios-green)_20%,transparent)]',
    red: 'text-ios-red bg-[color-mix(in_srgb,var(--ios-red)_20%,transparent)]',
    orange: 'text-ios-orange bg-[color-mix(in_srgb,var(--ios-orange)_20%,transparent)]',
    gray: 'text-label bg-fill',
  }
  return (
    <button
      type="button"
      className={cn(
        'relative flex h-[84px] w-[84px] items-center justify-center rounded-full text-[17px] transition-[filter,transform] hover:brightness-125 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100',
        tones[tone],
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-[3px] rounded-full border-2 border-bg" />
      {children}
    </button>
  )
}
