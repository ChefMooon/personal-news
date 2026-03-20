import { useState, useEffect, useCallback } from 'react'
import type { YtChannel } from '../../../shared/ipc-types'

export function useYouTubeChannels(): { channels: YtChannel[]; loading: boolean } {
  const [channels, setChannels] = useState<YtChannel[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    window.api
      .invoke('youtube:getChannels')
      .then((data) => {
        setChannels(data as YtChannel[])
        setLoading(false)
      })
      .catch(console.error)
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
