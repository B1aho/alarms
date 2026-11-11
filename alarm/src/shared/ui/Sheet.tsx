import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeftIcon } from './Icons'
import { TextButton } from './controls'

/** Modal sheet. Desktop adaptation of an iOS form sheet: centred card, one elevation level up. */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="elevated relative flex max-h-[min(860px,92dvh)] w-full max-w-[480px] flex-col overflow-hidden rounded-[14px] bg-bg text-label shadow-[0_24px_80px_rgba(0,0,0,0.45)] outline-none animate-sheet-in"
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function SheetHeader({ leading, title, trailing }: { leading?: ReactNode; title: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-separator bg-material px-4 backdrop-blur-xl">
      <div className="justify-self-start">{leading}</div>
      <h2 className="text-[17px] font-semibold">{title}</h2>
      <div className="justify-self-end">{trailing}</div>
    </div>
  )
}

export function SheetBody({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-4">{children}</div>
}

export function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <TextButton onClick={onClick} className="-ml-1.5 gap-0.5">
      <ChevronLeftIcon className="text-[20px]" />
      {label}
    </TextButton>
  )
}
