import { useCallback, useEffect, useState } from 'react'
import {
  IPC,
  type MediaType,
  type YtVideo,
  type YouTubeVideosFilterResult,
  type YoutubeVideoWatchedChangedEvent
} from '../../../shared/ipc-types'

interface UseYouTubeVideosFilteredOptions {
  limit?: number
  offset?: number
  channelId?: string | null
  mediaTypes?: MediaType[]
  search?: string
  sortDir?: 'asc' | 'desc'
  hideWatched?: boolean
}

interface UseYouTubeVideosFilteredResult {
  videos: YtVideo[]
  total: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  channelId: string | null
  setChannelId: (channelId: string | null) => void
  mediaTypes: MediaType[]
  setMediaTypes: (mediaTypes: MediaType[]) => void
  search: string
  setSearch: (search: string) => void
  sortDir: 'asc' | 'desc'
  setSortDir: (sortDir: 'asc' | 'desc') => void
  hideWatched: boolean
  setHideWatched: (hideWatched: boolean) => void
  offset: number
  setOffset: (offset: number) => void
}

export function useYouTubeVideosFiltered(
  options: UseYouTubeVideosFilteredOptions = {}
): UseYouTubeVideosFilteredResult {
  const [videos, setVideos] = useState<YtVideo[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [channelId, setChannelId] = useState<string | null>(options.channelId ?? null)
  const [mediaTypes, setMediaTypes] = useState<MediaType[]>(options.mediaTypes ?? [])
  const [search, setSearch] = useState(options.search ?? '')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(options.sortDir ?? 'desc')
  const [hideWatched, setHideWatched] = useState(options.hideWatched ?? false)
  const [offset, setOffset] = useState(options.offset ?? 0)
  const limit = options.limit ?? 50

  const fetch = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = (await window.api.invoke(IPC.YOUTUBE_GET_VIDEOS_FILTERED, {
        channelId: channelId ?? undefined,
        mediaTypes,
        search,
        sortDir,
        hideWatched,
        limit,
        offset
      })) as YouTubeVideosFilterResult

      setVideos(Array.isArray(data.videos) ? data.videos : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load YouTube videos.')
      setVideos([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [channelId, hideWatched, limit, mediaTypes, offset, search, sortDir])

  useEffect(() => {
    void fetch()
  }, [fetch])

  useEffect(() => {
    const handler = (): void => {
      void fetch()
    }
    return window.api.on(IPC.YOUTUBE_UPDATED, handler)
  }, [fetch])

  useEffect(() => {
    const handler = (...args: unknown[]): void => {
      const event = args[0] as YoutubeVideoWatchedChangedEvent

      setVideos((prev) => {
        const next = prev
          .map((video) =>
            video.video_id === event.videoId ? { ...video, watched_at: event.watchedAt } : video
          )
          .filter((video) => !(hideWatched && video.watched_at != null))

        if (next.length !== prev.length && hideWatched && event.watchedAt != null) {
          setTotal((current) => Math.max(0, current - 1))
        }

        return next
      })

      // If a hidden watched video becomes unwatched elsewhere, refetch so it can re-enter this list.
      if (hideWatched && event.watchedAt === null) {
        void fetch()
      }
    }

    return window.api.on(IPC.YOUTUBE_VIDEO_WATCHED_CHANGED, handler)
  }, [fetch, hideWatched])

  return {
    videos,
    total,
    loading,
    error,
    refetch: fetch,
    channelId,
    setChannelId,
    mediaTypes,
    setMediaTypes,
    search,
    setSearch,
    sortDir,
    setSortDir,
    hideWatched,
    setHideWatched,
    offset,
    setOffset
  }
}
