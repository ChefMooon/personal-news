import { useState, useEffect, useCallback } from 'react'
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
        setLoading(false)
      })
      .catch(console.error)
  }, [channelId])

  useEffect(() => {
    fetch()

    const handler = (): void => {
      fetch()
    }

    window.api.on('youtube:updated', handler)
    return () => {
      window.api.off('youtube:updated', handler)
    }
  }, [fetch])

  return { videos, loading }
}
