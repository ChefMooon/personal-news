import { useSidebarConfigContext } from '../contexts/SidebarConfigContext'
import type { SidebarConfig, SidebarItemId } from '../../../shared/ipc-types'

export function useSidebarConfig(): {
  config: SidebarConfig
  loading: boolean
  moveItem: (itemId: SidebarItemId, direction: 'up' | 'down') => void
  setItemOrder: (itemOrder: SidebarItemId[]) => void
  setItemHidden: (itemId: SidebarItemId, hidden: boolean) => void
  resetConfig: () => void
} {
  return useSidebarConfigContext()
}