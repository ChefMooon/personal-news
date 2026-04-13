import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { WeatherViewConfig } from '../../../shared/ipc-types'

export const DEFAULT_WEATHER_VIEW_CONFIG: WeatherViewConfig = {
  locationId: null,
  detailLevel: 'standard',
  displayMode: 'current_hourly',
  forecastView: 'all',
  showAlerts: true,
  showPrecipitation: true,
  showWind: true,
  showHumidity: false,
  showFeelsLike: true,
  showSunTimes: false
}

export function useWeatherConfig(instanceId: string): {
  config: WeatherViewConfig
  setConfig: (newConfig: WeatherViewConfig) => void
} {
  const [config, setConfigState] = useState<WeatherViewConfig>(DEFAULT_WEATHER_VIEW_CONFIG)
  const storageKey = `weather_view_config:${instanceId}`

  useEffect(() => {
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw as string) as Partial<WeatherViewConfig>
            // Migrate legacy combined mode to current_all
            if ((parsed.displayMode as string) === 'current_both') {
              parsed.displayMode = 'current_all'
            }
            setConfigState({
              ...DEFAULT_WEATHER_VIEW_CONFIG,
              ...parsed
            })
          } catch {
            // Use default on parse error
          }
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Weather widget settings.')
      })
  }, [instanceId, storageKey])

  const setConfig = (newConfig: WeatherViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Weather widget settings.')
      })
  }

  return { config, setConfig }
}