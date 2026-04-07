import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type IpcMutationResult, type WeatherLocation, type WeatherSearchResult } from '../../../shared/ipc-types'

export function useWeatherLocations(): {
  locations: WeatherLocation[]
  loading: boolean
  refetch: () => void
  search: (query: string) => Promise<WeatherSearchResult[]>
  saveLocation: (location: WeatherSearchResult) => Promise<WeatherLocation | null>
  removeLocation: (locationId: string) => Promise<boolean>
} {
  const [locations, setLocations] = useState<WeatherLocation[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    setLoading(true)
    window.api
      .invoke(IPC.WEATHER_GET_LOCATIONS)
      .then((data) => {
        setLocations(data as WeatherLocation[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load saved weather locations.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    refetch()
    return window.api.on(IPC.WEATHER_UPDATED, () => {
      refetch()
    })
  }, [refetch])

  const search = async (query: string): Promise<WeatherSearchResult[]> => {
    try {
      const result = await window.api.invoke(IPC.WEATHER_SEARCH_LOCATIONS, query)
      return result as WeatherSearchResult[]
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to search weather locations.')
      return []
    }
  }

  const saveLocation = async (location: WeatherSearchResult): Promise<WeatherLocation | null> => {
    try {
      const result = await window.api.invoke(IPC.WEATHER_SAVE_LOCATION, location)
      const saved = result as WeatherLocation
      setLocations((prev) => {
        const next = prev.filter((item) => item.id !== saved.id)
        return [...next, saved].sort((a, b) => a.createdAt - b.createdAt)
      })
      return saved
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save weather location.')
      return null
    }
  }

  const removeLocation = async (locationId: string): Promise<boolean> => {
    try {
      const result = (await window.api.invoke(IPC.WEATHER_REMOVE_LOCATION, locationId)) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to remove weather location.')
        return false
      }

      setLocations((prev) => prev.filter((location) => location.id !== locationId))
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove weather location.')
      return false
    }
  }

  return { locations, loading, refetch, search, saveLocation, removeLocation }
}