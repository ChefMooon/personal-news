import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Bookmark,
  Cloud,
  Flame,
  LayoutDashboard,
  Newspaper,
  Star,
  Terminal,
  Trophy,
  Youtube
} from 'lucide-react'
import type { DashboardIcon } from '../../../shared/ipc-types'

const DASHBOARD_ICON_COMPONENTS: Record<DashboardIcon, LucideIcon> = {
  layout: LayoutDashboard,
  youtube: Youtube,
  newspaper: Newspaper,
  bookmark: Bookmark,
  trophy: Trophy,
  cloud: Cloud,
  terminal: Terminal,
  bell: Bell,
  star: Star,
  flame: Flame
}

export const DASHBOARD_ICON_OPTIONS: Array<{ value: DashboardIcon; label: string }> = [
  { value: 'layout', label: 'Layout' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'newspaper', label: 'News' },
  { value: 'bookmark', label: 'Bookmarks' },
  { value: 'trophy', label: 'Sports' },
  { value: 'cloud', label: 'Weather' },
  { value: 'terminal', label: 'Scripts' },
  { value: 'bell', label: 'Alerts' },
  { value: 'star', label: 'Highlights' },
  { value: 'flame', label: 'Trending' }
]

interface DashboardGlyphProps {
  icon: DashboardIcon
  className?: string
}

export function DashboardGlyph({ icon, className }: DashboardGlyphProps): React.ReactElement {
  const Icon = DASHBOARD_ICON_COMPONENTS[icon]
  return <Icon className={className} />
}