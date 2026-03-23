import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { YtChannel } from '../../../shared/ipc-types'

export function useYouTubeChannels(): { channels: YtChannel[]; loading: boolean } {
  const [channels, setChannels] = useState<YtChannel[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    setLoading(true)
    window.api
      .invoke('youtube:getChannels')
      .then((data) => {
        setChannels(data as YtChannel[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load YouTube channels.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetch()

    // Subscribe to push updates from main process
    // Even though the poller is not active in the prototype, this wires the architecture
    const handler = (): void => {
      fetch()
    }
    return window.api.on('youtube:updated', handler)
  }, [fetch])

  return { channels, loading }
}
