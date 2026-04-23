import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { SportsViewConfig } from '../../../shared/ipc-types'
import { DEFAULT_SPORT, isWidgetSport } from '../../../shared/sports'

const VALID_VIEW_MODES: SportsViewConfig['viewMode'][] = [
  'all_games',
  'today',
  'summarized',
  'standard',
  'detailed'
]

function isSportsViewMode(value: string): value is SportsViewConfig['viewMode'] {
  return VALID_VIEW_MODES.includes(value as SportsViewConfig['viewMode'])
}

export const DEFAULT_SPORTS_VIEW_CONFIG: SportsViewConfig = {
  sport: DEFAULT_SPORT,
  viewMode: 'today',
  showVenue: false,
  showTime: true,
  showLiveStartTime: true
}

export function normalizeSportsViewConfig(config: Partial<SportsViewConfig>): SportsViewConfig {
  const sport = config.sport
  const storedViewMode = (config as { viewMode?: string }).viewMode
  const rawViewMode = storedViewMode === 'my_teams' ? 'today' : storedViewMode
  const viewMode = rawViewMode && isSportsViewMode(rawViewMode) ? rawViewMode : DEFAULT_SPORTS_VIEW_CONFIG.viewMode

  return {
    ...DEFAULT_SPORTS_VIEW_CONFIG,
    ...config,
    sport: sport && isWidgetSport(sport) ? sport : DEFAULT_SPORT,
    viewMode
  }
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
            setConfigState(normalizeSportsViewConfig(JSON.parse(raw as string) as Partial<SportsViewConfig>))
          } catch {
          }
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Sports widget settings.')
      })
  }, [storageKey])

  const setConfig = (newConfig: SportsViewConfig): void => {
    const normalizedConfig = normalizeSportsViewConfig(newConfig)
    setConfigState(normalizedConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(normalizedConfig))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Sports widget settings.')
      })
  }

  return { config, setConfig }
}