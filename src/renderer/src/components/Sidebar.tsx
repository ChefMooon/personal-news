import React, { useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bookmark, Terminal, Settings, ChevronLeft, ChevronRight, Youtube, Newspaper, Bell } from 'lucide-react'
import { cn } from '../lib/utils'
import { useScripts } from '../hooks/useScripts'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { useScriptNotifications } from '../hooks/useScriptNotifications'
import { NotificationsFlyout } from './NotificationsFlyout'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  attention?: boolean
}

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const { scripts } = useScripts()
  const hasStaleScripts = scripts.some((s) => s.is_stale)
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  const { unreadCount } = useScriptNotifications()

  const navItems: NavItem[] = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5 shrink-0" />
    },
    ...(redditDigestEnabled
      ? [
          {
            to: '/reddit-digest',
            label: 'Reddit Digest',
            icon: <Newspaper className="h-5 w-5 shrink-0" />
          }
        ]
      : []),
    ...(savedPostsEnabled
      ? [
          {
            to: '/saved-posts',
            label: 'Saved Posts',
            icon: <Bookmark className="h-5 w-5 shrink-0" />
          }
        ]
      : []),
    {
      to: '/youtube',
      label: 'YouTube',
      icon: <Youtube className="h-5 w-5 shrink-0" />
    },
    {
      to: '/scripts',
      label: 'Script Manager',
      icon: <Terminal className="h-5 w-5 shrink-0" />,
      attention: hasStaleScripts
    }
  ]

  const closeNotifications = (): void => {
    setIsNotifOpen(false)
    notificationsButtonRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full border-r bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-[200px]'
      )}
      style={{ flexShrink: 0 }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center border-b py-2',
          collapsed ? '' : 'justify-between px-3'
        )}
      >
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">Personal News</span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex items-center justify-center px-3 py-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
            collapsed ? 'flex-1 mx-1' : 'ml-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-pressed={collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5 shrink-0" />
          ) : (
            <ChevronLeft className="h-5 w-5 shrink-0" />
          )}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : item.attention
                    ? 'bg-amber-500/10 text-muted-foreground hover:bg-amber-500/20 hover:text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            }
          >
            {item.icon}
            {!collapsed && (
              <span className="flex-1 truncate">{item.label}</span>
            )}
          </NavLink>
        ))}

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 mx-1 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )
          }
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed && (
            <span className="flex-1 truncate">Settings</span>
          )}
        </NavLink>
      </nav>

      <div className="border-t py-2">
        <button
          ref={notificationsButtonRef}
          type="button"
          onClick={() => setIsNotifOpen((open) => !open)}
          aria-label={unreadCount === 0 ? 'Notifications' : `Notifications, ${unreadCount} unread`}
          aria-expanded={isNotifOpen}
          className={cn(
            'relative mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
            isNotifOpen
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Bell className="h-5 w-5 shrink-0" />
          {!collapsed && <span className="flex-1 truncate text-left">Notifications</span>}
          {unreadCount > 0 && (
            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>
      </div>

      {isNotifOpen && <NotificationsFlyout onClose={closeNotifications} />}
    </div>
  )
}
