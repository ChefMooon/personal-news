import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bookmark, Terminal, Settings, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  badge?: React.ReactNode
}

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)

  const navItems: NavItem[] = [
    {
      to: '/',
      label: 'Dashboard',
      icon: <LayoutDashboard className="h-5 w-5 shrink-0" />
    },
    {
      to: '/saved-posts',
      label: 'Saved Posts',
      icon: <Bookmark className="h-5 w-5 shrink-0" />
    },
    {
      to: '/scripts',
      label: 'Script Manager',
      icon: <Terminal className="h-5 w-5 shrink-0" />,
      // Hardcode hasStale: true — seed data includes a stale script
      badge: (
        <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
      )
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <Settings className="h-5 w-5 shrink-0" />
    }
  ]

  return (
    <div
      className={cn(
        'flex flex-col h-full border-r bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-[200px]'
      )}
      style={{ flexShrink: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b">
        {!collapsed && (
          <span className="text-sm font-semibold text-foreground truncate">Personal News</span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-auto"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
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
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            }
          >
            {item.icon}
            {!collapsed && (
              <>
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge}
              </>
            )}
            {collapsed && item.badge && <span className="absolute ml-6">{item.badge}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
