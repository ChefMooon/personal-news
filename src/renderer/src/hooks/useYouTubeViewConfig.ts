import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type YouTubeViewConfig } from '../../../shared/ipc-types'

export const DEFAULT_YOUTUBE_VIEW_CONFIG: YouTubeViewConfig = {
  showVideos: true,
  showShorts: true,
  showUpcomingStreams: true,
  showLiveNow: true,
  showPastLivestreams: true,
  channelMode: 'all',
  selectedChannelIds: [],
  channelOrder: [],
  pinnedChannelIds: [],
  showUpcomingPanel: true,
  maxVideosPerChannel: 15,
  videoSortDirection: 'newest',
  cardDensity: 'detailed',
  showChannelHeaders: true,
  collapseChannelsByDefault: false,
  hideWatched: false,
  perChannelMediaOverrides: {}
}

export function useYouTubeViewConfig(instanceId: string): {
  config: YouTubeViewConfig
  setConfig: (newConfig: YouTubeViewConfig) => void
  loading: boolean
} {
  const [config, setConfigState] = useState<YouTubeViewConfig>(DEFAULT_YOUTUBE_VIEW_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!instanceId) {
      setConfigState(DEFAULT_YOUTUBE_VIEW_CONFIG)
      setLoading(false)
      return
    }

    setLoading(true)
    window.api
      .invoke(IPC.SETTINGS_GET_YOUTUBE_VIEW_CONFIG, instanceId)
      .then((value) => {
        setConfigState({ ...DEFAULT_YOUTUBE_VIEW_CONFIG, ...(value as Partial<YouTubeViewConfig>) })
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load YouTube view settings.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [instanceId])

  const setConfig = (newConfig: YouTubeViewConfig): void => {
    setConfigState(newConfig)
    if (!instanceId) {
      return
    }
    window.api
      .invoke(IPC.SETTINGS_SET_YOUTUBE_VIEW_CONFIG, instanceId, newConfig)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save YouTube view settings.')
      })
  }

  return { config, setConfig, loading }
}
