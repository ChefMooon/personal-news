import React, { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bookmark, Terminal, Settings, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useScripts } from '../hooks/useScripts'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  attention?: boolean
}

export function Sidebar(): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const { scripts } = useScripts()
  const hasStaleScripts = scripts.some((s) => s.is_stale)

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
      attention: hasStaleScripts
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
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex items-center justify-center px-3 py-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors',
            collapsed ? 'flex-1 mx-1' : 'ml-auto'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
      </nav>
    </div>
  )
}
