import React, { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScriptNotification } from '../../../shared/ipc-types'
import { useScriptNotifications } from '../hooks/useScriptNotifications'
import { formatRelativeTime } from '../lib/time'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'

interface NotificationsFlyoutProps {
  onClose: () => void
}

function SeverityDot({ severity }: { severity: ScriptNotification['severity'] }): React.ReactElement {
  return (
    <span
      className={cn(
        'mt-1 h-2 w-2 shrink-0 rounded-full',
        severity === 'error' && 'bg-red-500',
        severity === 'warning' && 'bg-amber-500',
        severity === 'info' && 'bg-blue-500'
      )}
    />
  )
}

export function NotificationsFlyout({ onClose }: NotificationsFlyoutProps): React.ReactElement {
  const { notifications, unreadCount, markAllRead, markRead } = useScriptNotifications()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const handler = (event: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleNotificationClick = async (id: number): Promise<void> => {
    await markRead(id)
    navigate('/scripts')
    onClose()
  }

  const handleMarkReadClick = async (
    event: React.MouseEvent<HTMLButtonElement>,
    id: number
  ): Promise<void> => {
    event.stopPropagation()
    await markRead(id)
  }

  return (
    <div className="fixed bottom-2 left-14 z-50">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications panel"
        tabIndex={-1}
        className="flex h-[380px] w-[300px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            className="h-7 px-2 text-xs"
          >
            Mark all read
          </Button>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            You&apos;re all caught up
          </div>
        ) : (
          <ScrollArea className="h-full">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => void handleNotificationClick(notification.id)}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/60',
                  notification.is_read === 0 ? 'bg-accent/40' : 'text-muted-foreground'
                )}
              >
                <SeverityDot severity={notification.severity} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-xs leading-snug">{notification.message}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(notification.created_at)}
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={(event) => void handleMarkReadClick(event, notification.id)}
                  disabled={notification.is_read !== 0}
                  className="h-6 px-2 text-[10px]"
                >
                  {notification.is_read === 0 ? 'Mark read' : 'Read'}
                </Button>
              </div>
            ))}
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
