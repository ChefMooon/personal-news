import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type WeatherSettings } from '../../../shared/ipc-types'

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  pollIntervalMinutes: 30,
  defaultLocationId: null,
  temperatureUnit: 'celsius',
  windSpeedUnit: 'kmh',
  precipitationUnit: 'mm',
  timeFormat: 'system',
  showAlertsInWidgets: true,
  thresholds: {
    rainMm: 10,
    snowCm: 5,
    windKph: 45,
    freezeTempC: 0,
    heatTempC: 32
  }
}

export function useWeatherSettings(): {
  settings: WeatherSettings
  loading: boolean
  saveSettings: (next: WeatherSettings) => Promise<WeatherSettings | null>
} {
  const [settings, setSettings] = useState<WeatherSettings>(DEFAULT_WEATHER_SETTINGS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke(IPC.WEATHER_GET_SETTINGS)
      .then((data) => {
        setSettings(data as WeatherSettings)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load weather settings.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const saveSettings = async (next: WeatherSettings): Promise<WeatherSettings | null> => {
    try {
      const saved = (await window.api.invoke(IPC.WEATHER_SET_SETTINGS, next)) as WeatherSettings
      setSettings(saved)
      return saved
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save weather settings.')
      return null
    }
  }

  return { settings, loading, saveSettings }
}