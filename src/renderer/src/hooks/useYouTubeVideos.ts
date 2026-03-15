import { useState, useEffect } from 'react'
import type { YtVideo } from '../../../shared/ipc-types'

export function useYouTubeVideos(channelId: string): { videos: YtVideo[]; loading: boolean } {
  const [videos, setVideos] = useState<YtVideo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api
      .invoke('youtube:getVideos', channelId)
      .then((data) => {
        setVideos(data as YtVideo[])
        setLoading(false)
      })
      .catch(console.error)
  }, [channelId])

  return { videos, loading }
}
