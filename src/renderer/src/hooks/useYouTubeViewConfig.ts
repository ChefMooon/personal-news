import { useEffect, useState } from 'react'
import { IPC, type YouTubeViewConfig } from '../../../shared/ipc-types'

const DEFAULT_CONFIG: YouTubeViewConfig = {
  showVideos: true,
  showShorts: true,
  showUpcomingStreams: true,
  showLiveNow: true,
  showPastLivestreams: true
}

export function useYouTubeViewConfig(instanceId: string): {
  config: YouTubeViewConfig
  setConfig: (newConfig: YouTubeViewConfig) => void
  loading: boolean
} {
  const [config, setConfigState] = useState<YouTubeViewConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!instanceId) {
      setConfigState(DEFAULT_CONFIG)
      setLoading(false)
      return
    }

    setLoading(true)
    window.api
      .invoke(IPC.SETTINGS_GET_YOUTUBE_VIEW_CONFIG, instanceId)
      .then((value) => {
        setConfigState({ ...DEFAULT_CONFIG, ...(value as Partial<YouTubeViewConfig>) })
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false)
      })
  }, [instanceId])

  const setConfig = (newConfig: YouTubeViewConfig): void => {
    setConfigState(newConfig)
    if (!instanceId) {
      return
    }
    window.api.invoke(IPC.SETTINGS_SET_YOUTUBE_VIEW_CONFIG, instanceId, newConfig).catch(console.error)
  }

  return { config, setConfig, loading }
}
