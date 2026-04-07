import React, { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC } from '../../../shared/ipc-types'

interface WeatherEnabledContextValue {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

const WeatherEnabledContext = createContext<WeatherEnabledContextValue>({
  enabled: true,
  setEnabled: () => {}
})

export function WeatherEnabledProvider({
  children
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'weather_enabled')
      .then((raw) => {
        if (raw === 'false') {
          setEnabledState(false)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Weather feature flag.')
      })
  }, [])

  const setEnabled = (value: boolean): void => {
    setEnabledState(value)
    window.api
      .invoke(IPC.SETTINGS_SET, 'weather_enabled', String(value))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Weather feature flag.')
      })
  }

  return (
    <WeatherEnabledContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </WeatherEnabledContext.Provider>
  )
}

export function useWeatherEnabled(): WeatherEnabledContextValue {
  return useContext(WeatherEnabledContext)
}