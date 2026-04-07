import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type WeatherSnapshot } from '../../../shared/ipc-types'

export function useWeatherSnapshot(locationId: string | null): {
  snapshot: WeatherSnapshot | null
  loading: boolean
  refetch: () => void
} {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(() => {
    if (!locationId) {
      setSnapshot(null)
      setLoading(false)
      return
    }

    setLoading(true)
    window.api
      .invoke(IPC.WEATHER_GET_SNAPSHOT, locationId)
      .then((data) => {
        setSnapshot((data as WeatherSnapshot | null) ?? null)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load weather data.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [locationId])

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    return window.api.on(IPC.WEATHER_UPDATED, () => {
      refetch()
    })
  }, [refetch])

  return { snapshot, loading, refetch }
}