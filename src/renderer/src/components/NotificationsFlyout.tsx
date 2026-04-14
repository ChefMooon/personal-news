import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScriptNotification } from '../../../shared/ipc-types'
import { formatRelativeTime } from '../lib/time'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'

const FLYOUT_WIDTH_PX = 300
const FLYOUT_HEIGHT_PX = 380
const FLYOUT_GAP_PX = 8
const VIEWPORT_MARGIN_PX = 8

interface NotificationsFlyoutProps {
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  notifications: ScriptNotification[]
  unreadCount: number
  markAllRead: () => Promise<void>
  markRead: (id: number) => Promise<void>
}

function SeverityDot({
  severity,
  visible = true
}: {
  severity: ScriptNotification['severity']
  visible?: boolean
}): React.ReactElement {
  return (
    <span
      className={cn(
        'mt-1 h-2 w-2 shrink-0 rounded-full',
        !visible && 'opacity-0',
        severity === 'error' && 'bg-red-500',
        severity === 'warning' && 'bg-amber-500',
        severity === 'info' && 'bg-blue-500'
      )}
      aria-hidden="true"
    />
  )
}

export function NotificationsFlyout({
  onClose,
  anchorRef,
  notifications,
  unreadCount,
  markAllRead,
  markRead
}: NotificationsFlyoutProps): React.ReactElement {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ top: VIEWPORT_MARGIN_PX, left: VIEWPORT_MARGIN_PX })

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const anchor = anchorRef.current
      if (!anchor) {
        return
      }

      const rect = anchor.getBoundingClientRect()
      const maxLeft = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - FLYOUT_WIDTH_PX - VIEWPORT_MARGIN_PX)
      const maxTop = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - FLYOUT_HEIGHT_PX - VIEWPORT_MARGIN_PX)

      setPosition({
        top: Math.min(rect.bottom + FLYOUT_GAP_PX, maxTop),
        left: Math.min(Math.max(rect.right - FLYOUT_WIDTH_PX, VIEWPORT_MARGIN_PX), maxLeft)
      })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [anchorRef])

  useEffect(() => {
    const handler = (event: MouseEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return
      }

      if (panelRef.current) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [anchorRef, onClose])

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
    <div className="fixed z-50" style={{ top: position.top, left: position.left }}>
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
                <SeverityDot
                  severity={notification.severity}
                  visible={notification.is_read === 0}
                />
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
