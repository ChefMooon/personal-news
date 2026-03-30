import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { IPC, type YtVideo, type YoutubeVideoWatchedChangedEvent } from '../../../shared/ipc-types'

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

    return window.api.on(IPC.YOUTUBE_UPDATED, handler)
  }, [fetch])

  useEffect(() => {
    const handler = (...args: unknown[]): void => {
      const event = args[0] as YoutubeVideoWatchedChangedEvent
      setVideos((prev) =>
        prev.map((video) =>
          video.video_id === event.videoId ? { ...video, watched_at: event.watchedAt } : video
        )
      )
    }

    return window.api.on(IPC.YOUTUBE_VIDEO_WATCHED_CHANGED, handler)
  }, [])

  return { videos, loading }
}
