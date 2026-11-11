import { useState } from 'react'
import { formatRelative, useNow } from '@/shared/lib'
import { requestNotifyPermission, useNotifyPermission } from '@/shared/notify'
import { useHourCycle, useSettings } from '@/shared/settings'
import { AlarmIcon, Banner, BellIcon, FilledButton, PageHeader, PlusIcon, Section, TextButton } from '@/shared/ui'
import { newAlarm, type Alarm } from '../model/alarm'
import { nextUpcoming } from '../model/schedule'
import { useAlarms } from '../model/store'
import { AlarmEditor } from './AlarmEditor'
import { AlarmRow } from './AlarmRow'

export function AlarmsPage() {
  const { loaded, items } = useAlarms()
  const settings = useSettings()
  const cycle = useHourCycle()
  const now = useNow(15_000)
  const [editor, setEditor] = useState<{ alarm: Alarm; isNew: boolean } | null>(null)
  const [editMode, setEditMode] = useState(false)

  const next = nextUpcoming(items)
  const add = () => setEditor({ alarm: newAlarm(settings), isNew: true })

  return (
    <>
      <PageHeader
        title="Alarms"
        leading={
          items.length > 0 && (
            <TextButton onClick={() => setEditMode((m) => !m)} bold={editMode}>
              {editMode ? 'Done' : 'Edit'}
            </TextButton>
          )
        }
        trailing={
          items.length > 0 && (
          <button
            type="button"
            aria-label="Add alarm"
            title="Add alarm"
            onClick={add}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[24px] text-accent transition hover:bg-fill-2 active:opacity-60"
          >
            <PlusIcon />
          </button>
          )
        }
        subtitle={loaded ? (next ? `Next alarm in ${formatRelative(next.at - now)}` : 'No alarms on') : ' '}
      />

      <NotificationBanner />

      {loaded && items.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <AlarmIcon className="mb-4 text-[54px] text-label-3" />
          <p className="text-[22px] font-semibold">No Alarms</p>
          <p className="mt-1 mb-6 text-[15px] text-label-2">Add an alarm to wake up on time.</p>
          <FilledButton onClick={add}>Add Alarm</FilledButton>
        </div>
      ) : (
        <Section header="Alarms">
          {items.map((a) => (
            <AlarmRow
              key={a.id}
              alarm={a}
              cycle={cycle}
              editMode={editMode}
              onEdit={() => setEditor({ alarm: a, isNew: false })}
            />
          ))}
        </Section>
      )}

      {editor && <AlarmEditor alarm={editor.alarm} isNew={editor.isNew} onClose={() => setEditor(null)} />}
    </>
  )
}

function NotificationBanner() {
  const permission = useNotifyPermission()
  if (permission === 'granted' || permission === 'unsupported') return null
  if (permission === 'denied') {
    return (
      <Banner icon={<BellIcon className="text-ios-red" />} title="Notifications are blocked">
        Alarms still ring while the app is open, but you will not see them when the window is hidden. Allow notifications for
        this site in your browser’s site settings.
      </Banner>
    )
  }
  return (
    <Banner
      icon={<BellIcon className="text-accent" />}
      title="Allow Notifications"
      action={
        <FilledButton className="h-8 rounded-full px-4 text-[15px]" onClick={() => void requestNotifyPermission()}>
          Turn On
        </FilledButton>
      }
    >
      So alarms reach you even when the app is minimised or behind other windows.
    </Banner>
  )
}
