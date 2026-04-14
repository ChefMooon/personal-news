import React from 'react'
import { Bell, Copy, Minus, Square, X } from 'lucide-react'
import { IPC, type WindowState } from '../../../shared/ipc-types'
import { useScriptNotifications } from '../hooks/useScriptNotifications'
import { cn } from '../lib/utils'
import { NotificationsFlyout } from './NotificationsFlyout'

const iconUrl = new URL('../assets/app-icon.svg', import.meta.url).href

const DEFAULT_WINDOW_STATE: WindowState = {
  platform: 'win32',
  isMaximized: false,
  isFullScreen: false
}

export function WindowTitleBar(): React.ReactElement {
  const [windowState, setWindowState] = React.useState<WindowState>(DEFAULT_WINDOW_STATE)
  const [isNotificationsOpen, setIsNotificationsOpen] = React.useState(false)
  const notificationsButtonRef = React.useRef<HTMLButtonElement>(null)
  const { notifications, unreadCount, markAllRead, markRead } = useScriptNotifications()

  React.useEffect(() => {
    window.api
      .invoke(IPC.WINDOW_GET_STATE)
      .then((state) => {
        setWindowState(state as WindowState)
      })
      .catch(() => {
      })

    return window.api.on(IPC.WINDOW_STATE_CHANGED, (event) => {
      setWindowState(event as WindowState)
    })
  }, [])

  const handleMinimize = (): void => {
    void window.api.invoke(IPC.WINDOW_MINIMIZE)
  }

  const handleToggleMaximize = (): void => {
    void window.api.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE)
  }

  const handleClose = (): void => {
    void window.api.invoke(IPC.WINDOW_CLOSE)
  }

  const closeNotifications = React.useCallback((): void => {
    setIsNotificationsOpen(false)
    notificationsButtonRef.current?.focus()
  }, [])

  const isMac = windowState.platform === 'darwin'
  const isWindows = windowState.platform === 'win32'
  const isExpanded = windowState.isMaximized || windowState.isFullScreen

  return (
    <header
      className={cn(
        'window-titlebar flex h-10 items-center border-b border-border bg-background text-foreground',
        isMac ? 'px-3' : 'pl-3'
      )}
      onDoubleClick={isMac ? undefined : handleToggleMaximize}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2.5 pr-4',
          isMac ? 'mx-auto pl-[72px]' : ''
        )}
      >
        <img src={iconUrl} alt="" aria-hidden="true" draggable={false} className="h-5 w-5 shrink-0" />
        <span className="truncate text-[13px] font-semibold tracking-[0.01em]">Personal News</span>
      </div>

      {!isMac && (
        <>
          <div
            className="window-titlebar__no-drag ml-auto flex items-center"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <button
              ref={notificationsButtonRef}
              type="button"
              onClick={() => setIsNotificationsOpen((open) => !open)}
              className={cn(
                'relative flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors',
                isNotificationsOpen
                  ? 'bg-foreground/8 text-foreground'
                  : isWindows
                    ? 'hover:bg-foreground/8 hover:text-foreground'
                    : 'rounded-md hover:bg-accent hover:text-foreground'
              )}
              aria-label={unreadCount === 0 ? 'Notifications' : `Notifications, ${unreadCount} unread`}
              aria-expanded={isNotificationsOpen}
              aria-haspopup="dialog"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />}
            </button>
            <button
              type="button"
              onClick={handleMinimize}
              className={cn(
                'flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors',
                isWindows
                  ? 'hover:bg-foreground/8 hover:text-foreground'
                  : 'rounded-md hover:bg-accent hover:text-foreground'
              )}
              aria-label="Minimize window"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              className={cn(
                'flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors',
                isWindows
                  ? 'hover:bg-foreground/8 hover:text-foreground'
                  : 'rounded-md hover:bg-accent hover:text-foreground'
              )}
              aria-label={isExpanded ? 'Restore window' : 'Maximize window'}
            >
              {isExpanded ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className={cn(
                'flex h-10 w-11 items-center justify-center text-muted-foreground transition-colors',
                isWindows
                  ? 'hover:bg-[#c42b1c] hover:text-white'
                  : 'rounded-md hover:bg-destructive hover:text-destructive-foreground'
              )}
              aria-label="Close window"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isNotificationsOpen && (
            <NotificationsFlyout
              onClose={closeNotifications}
              anchorRef={notificationsButtonRef}
              notifications={notifications}
              unreadCount={unreadCount}
              markAllRead={markAllRead}
              markRead={markRead}
            />
          )}
        </>
      )}
    </header>
  )
}