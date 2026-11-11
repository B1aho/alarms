import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { CheckIcon, ChevronRightIcon } from './Icons'

/** An inset grouped section (UITableView.Style.insetGrouped). */
export function Section({
  header,
  footer,
  children,
  className,
}: {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-8', className)}>
      {header && <h2 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.01em] text-label-2">{header}</h2>}
      <div className="overflow-hidden rounded-[10px] bg-cell">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[13px] leading-[18px] text-label-2">{footer}</p>}
    </section>
  )
}

export function Row({
  label,
  detail,
  icon,
  onClick,
  chevron,
  checked,
  accessory,
  tone = 'label',
  children,
  className,
}: {
  label?: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  chevron?: boolean
  checked?: boolean
  accessory?: ReactNode
  tone?: 'label' | 'accent' | 'red' | 'blue'
  children?: ReactNode
  className?: string
}) {
  const content = (
    <>
      {icon && <span className="mr-3 flex shrink-0 items-center">{icon}</span>}
      {children ?? (
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-left',
            tone === 'accent' && 'text-accent',
            tone === 'red' && 'text-ios-red',
            tone === 'blue' && 'text-ios-blue',
          )}
        >
          {label}
        </span>
      )}
      {detail !== undefined && <span className="ml-3 shrink-0 truncate text-label-2">{detail}</span>}
      {accessory && <span className="ml-3 flex shrink-0 items-center">{accessory}</span>}
      {checked && <CheckIcon className="ml-3 shrink-0 text-[17px] text-accent" />}
      {chevron && <ChevronRightIcon className="ml-2 shrink-0 text-[13px] text-label-3" />}
    </>
  )
  const base = cn(
    'ios-row relative flex min-h-[44px] w-full items-center px-4 py-[11px] text-[17px] leading-[22px]',
    className,
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'transition-colors hover:bg-cell-hover active:bg-cell-hover')}>
        {content}
      </button>
    )
  }
  return <div className={base}>{content}</div>
}

/** Large-title navigation header. */
export function PageHeader({
  title,
  leading,
  trailing,
  subtitle,
}: {
  title: string
  leading?: ReactNode
  trailing?: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <header className="mb-5">
      <div className="flex h-11 items-center justify-between">
        <div className="flex items-center gap-4">{leading}</div>
        <div className="flex items-center gap-4">{trailing}</div>
      </div>
      <h1 className="font-display text-[34px] leading-[41px] font-bold tracking-[0.01em]">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[15px] text-label-2">{subtitle}</p>}
    </header>
  )
}

export function Banner({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[14px] bg-cell px-4 py-3.5 animate-fade-in">
      <span className="mt-0.5 text-[22px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">{title}</p>
        {children && <p className="mt-0.5 text-[13px] leading-[18px] text-label-2">{children}</p>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}
