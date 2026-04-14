import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Bookmark,
  Terminal,
  Settings,
  ChevronLeft,
  ChevronRight,
  Youtube,
  Newspaper,
  Trophy
} from 'lucide-react'
import { cn } from '../lib/utils'
import { useScripts } from '../hooks/useScripts'
import { useSidebarConfig } from '../hooks/useSidebarConfig'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { useSportsEnabled } from '../contexts/SportsEnabledContext'
import type { SidebarItemId } from '../../../shared/ipc-types'

interface NavItem {
  id: SidebarItemId
  to: string
  label: string
  icon: React.ReactNode
  attention?: boolean
}

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const { scripts } = useScripts()
  const hasStaleScripts = scripts.some((s) => s.is_stale)
  const { config } = useSidebarConfig()
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  const { enabled: sportsEnabled } = useSportsEnabled()

  const allNavItems: NavItem[] = [
    {
      id: 'dashboard',
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5 shrink-0" />
    },
    {
      id: 'youtube',
      to: '/youtube',
      label: 'YouTube',
      icon: <Youtube className="h-5 w-5 shrink-0" />
    },
    {
      id: 'reddit-digest',
      to: '/reddit-digest',
      label: 'Reddit Digest',
      icon: <Newspaper className="h-5 w-5 shrink-0" />
    },
    {
      id: 'saved-posts',
      to: '/saved-posts',
      label: 'Saved Posts',
      icon: <Bookmark className="h-5 w-5 shrink-0" />
    },
    {
      id: 'sports',
      to: '/sports',
      label: 'Sports',
      icon: <Trophy className="h-5 w-5 shrink-0" />
    },
    {
      id: 'scripts',
      to: '/scripts',
      label: 'Script Manager',
      icon: <Terminal className="h-5 w-5 shrink-0" />,
      attention: hasStaleScripts
    }
  ]

  const availableItemIds = new Set<SidebarItemId>([
    'dashboard',
    'youtube',
    'scripts',
    ...(redditDigestEnabled ? ['reddit-digest' as const] : []),
    ...(savedPostsEnabled ? ['saved-posts' as const] : []),
    ...(sportsEnabled ? ['sports' as const] : [])
  ])
  const hiddenItemIds = new Set(config.hiddenItemIds)
  const navItems = config.itemOrder
    .map((itemId) => allNavItems.find((item) => item.id === itemId))
    .filter((item): item is NavItem => item != null)
    .filter((item) => availableItemIds.has(item.id) && !hiddenItemIds.has(item.id))

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden border-r bg-card transition-[width] duration-200 ease-out',
        collapsed ? 'w-14' : 'w-[200px]'
      )}
      style={{ flexShrink: 0 }}
    >
      <div
        className={cn(
          'flex items-center border-b px-2 py-1.5',
          collapsed ? 'justify-center' : 'justify-end'
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground'
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
                'mx-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
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
              <span className="flex-1 truncate transition-opacity duration-150">{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'mx-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )
          }
        >
          <Settings className="h-5 w-5 shrink-0" />
          {!collapsed && (
            <span className="flex-1 truncate transition-opacity duration-150">Settings</span>
          )}
        </NavLink>
      </div>
    </div>
  )
}
