import { useState, type CSSProperties } from 'react'
import { cn, formatClock, formatTimestamp, type HourCycle } from '@/shared/lib'
import { ChevronRightIcon, MinusCircleIcon, Switch } from '@/shared/ui'
import { displayLabel, type Alarm } from '../model/alarm'
import { cancelSnooze } from '../model/engine'
import { repeatSummary } from '../model/schedule'
import { deleteAlarm, setAlarmEnabled } from '../model/store'

export function AlarmRow({
  alarm,
  cycle,
  editMode,
  onEdit,
}: {
  alarm: Alarm
  cycle: HourCycle
  editMode: boolean
  onEdit: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const { time, period } = formatClock(alarm.hour, alarm.minute, cycle)
  const repeat = repeatSummary(alarm.days)
  const active = alarm.enabled || alarm.snoozeUntil !== null
  const subtitle = [displayLabel(alarm), repeat === 'Never' ? null : repeat.toLowerCase()].filter(Boolean).join(', ')

  return (
    <div
      className="ios-row group relative flex min-h-[92px] cursor-default items-center gap-3 px-4 py-2.5 transition-colors hover:bg-cell-hover"
      onClick={onEdit}
      style={{ '--row-inset': editMode ? '56px' : '16px' } as CSSProperties}
    >
      {editMode && (
        <button
          type="button"
          aria-label={`Delete ${displayLabel(alarm)}`}
          className="shrink-0 text-[22px] text-ios-red transition-transform"
          style={{ transform: confirming ? 'rotate(-90deg)' : undefined }}
          onClick={(e) => {
            e.stopPropagation()
            setConfirming((c) => !c)
          }}
        >
          <MinusCircleIcon />
        </button>
      )}

      <div className={cn('min-w-0 flex-1 transition-colors', active ? 'text-label' : 'text-label-2')}>
        <div className="flex items-baseline font-display">
          <span className="tabular text-[54px] leading-[1.02] font-light tracking-[-0.02em]">{time}</span>
          {period && <span className="ml-1 text-[30px] font-light">{period}</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[15px]">
          <span className="truncate">{subtitle}</span>
        </div>
        {alarm.snoozeUntil !== null && (
          <div className="mt-1 flex items-center gap-2 text-[13px] text-accent">
            Snoozed until {formatTimestamp(alarm.snoozeUntil, cycle)}
            <button
              type="button"
              className="rounded-full bg-fill-2 px-2 py-0.5 text-[12px] text-label hover:bg-fill"
              onClick={(e) => {
                e.stopPropagation()
                void cancelSnooze(alarm.id)
              }}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {editMode ? (
        confirming ? (
          <button
            type="button"
            className="-my-2.5 -mr-4 self-stretch bg-ios-red px-6 text-[17px] text-white animate-fade-in hover:brightness-110"
            onClick={(e) => {
              e.stopPropagation()
              void deleteAlarm(alarm.id)
            }}
          >
            Delete
          </button>
        ) : (
          <ChevronRightIcon className="text-[14px] text-label-3" />
        )
      ) : (
        <Switch
          checked={alarm.enabled}
          label={`${displayLabel(alarm)} ${time}${period ?? ''}`}
          onChange={(v) => void setAlarmEnabled(alarm.id, v)}
        />
      )}
    </div>
  )
}
