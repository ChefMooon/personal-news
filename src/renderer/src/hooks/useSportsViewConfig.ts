import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SportsViewConfig } from '../../../shared/ipc-types'

export const DEFAULT_SPORTS_VIEW_CONFIG: SportsViewConfig = {
  sport: 'Baseball',
  viewMode: 'all_games',
  showVenue: false,
  showTime: true
}

export function useSportsViewConfig(instanceId: string): {
  config: SportsViewConfig
  setConfig: (newConfig: SportsViewConfig) => void
} {
  const [config, setConfigState] = useState<SportsViewConfig>(DEFAULT_SPORTS_VIEW_CONFIG)
  const storageKey = `sports_view_config:${instanceId}`

  useEffect(() => {
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState({
              ...DEFAULT_SPORTS_VIEW_CONFIG,
              ...(JSON.parse(raw as string) as Partial<SportsViewConfig>)
            })
          } catch {
          }
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Sports widget settings.')
      })
  }, [storageKey])

  const setConfig = (newConfig: SportsViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Sports widget settings.')
      })
  }

  return { config, setConfig }
}