import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DEFAULT_SIDEBAR_CONFIG,
  IPC,
  normalizeSidebarConfig,
  type IpcMutationResult,
  type SidebarConfig,
  type SidebarItemId
} from '../../../shared/ipc-types'

interface SidebarConfigContextValue {
  config: SidebarConfig
  loading: boolean
  moveItem: (itemId: SidebarItemId, direction: 'up' | 'down') => void
  setItemOrder: (itemOrder: SidebarItemId[]) => void
  setItemHidden: (itemId: SidebarItemId, hidden: boolean) => void
  resetConfig: () => void
}

const SidebarConfigContext = createContext<SidebarConfigContextValue>({
  config: DEFAULT_SIDEBAR_CONFIG,
  loading: true,
  moveItem: () => {},
  setItemOrder: () => {},
  setItemHidden: () => {},
  resetConfig: () => {}
})

export function SidebarConfigProvider({
  children
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [config, setConfigState] = useState<SidebarConfig>(DEFAULT_SIDEBAR_CONFIG)
  const [loading, setLoading] = useState(true)
  const configRef = useRef<SidebarConfig>(DEFAULT_SIDEBAR_CONFIG)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET_SIDEBAR_CONFIG)
      .then((value) => {
        const nextConfig = normalizeSidebarConfig(value)
        configRef.current = nextConfig
        setConfigState(nextConfig)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load sidebar settings.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const persistConfig = (nextConfig: SidebarConfig): void => {
    configRef.current = nextConfig
    setConfigState(nextConfig)

    window.api
      .invoke(IPC.SETTINGS_SET_SIDEBAR_CONFIG, nextConfig)
      .then((result) => {
        const mutation = result as IpcMutationResult
        if (!mutation.ok) {
          throw new Error(mutation.error ?? 'Failed to save sidebar settings.')
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save sidebar settings.')
      })
  }

  const moveItem = (itemId: SidebarItemId, direction: 'up' | 'down'): void => {
    const currentConfig = configRef.current
    const currentIndex = currentConfig.itemOrder.indexOf(itemId)
    if (currentIndex === -1) {
      return
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= currentConfig.itemOrder.length) {
      return
    }

    const nextOrder = [...currentConfig.itemOrder]
    const [movedItem] = nextOrder.splice(currentIndex, 1)
    nextOrder.splice(targetIndex, 0, movedItem)

    persistConfig(
      normalizeSidebarConfig({
        ...currentConfig,
        itemOrder: nextOrder
      })
    )
  }

  const setItemOrder = (itemOrder: SidebarItemId[]): void => {
    const currentConfig = configRef.current
    persistConfig(
      normalizeSidebarConfig({
        ...currentConfig,
        itemOrder
      })
    )
  }

  const setItemHidden = (itemId: SidebarItemId, hidden: boolean): void => {
    const currentConfig = configRef.current
    const hiddenItemIds = hidden
      ? [...currentConfig.hiddenItemIds, itemId]
      : currentConfig.hiddenItemIds.filter((currentItemId) => currentItemId !== itemId)

    persistConfig(
      normalizeSidebarConfig({
        ...currentConfig,
        hiddenItemIds
      })
    )
  }

  const resetConfig = (): void => {
    persistConfig(DEFAULT_SIDEBAR_CONFIG)
  }

  return (
    <SidebarConfigContext.Provider
      value={{
        config,
        loading,
        moveItem,
        setItemOrder,
        setItemHidden,
        resetConfig
      }}
    >
      {children}
    </SidebarConfigContext.Provider>
  )
}

export function useSidebarConfigContext(): SidebarConfigContextValue {
  return useContext(SidebarConfigContext)
}