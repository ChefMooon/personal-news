import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { YtVideo } from '../../../shared/ipc-types'

export function useYouTubeVideos(channelId: string): { videos: YtVideo[]; loading: boolean } {
  const [videos, setVideos] = useState<YtVideo[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    setLoading(true)
    window.api
      .invoke('youtube:getVideos', channelId)
      .then((data) => {
        setVideos(data as YtVideo[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load YouTube videos.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [channelId])

  useEffect(() => {
    fetch()

    const handler = (): void => {
      fetch()
    }

    return window.api.on('youtube:updated', handler)
  }, [fetch])

  return { videos, loading }
}
