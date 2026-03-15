import { useState, useEffect } from 'react'
import type { DigestViewConfig } from '../../../shared/ipc-types'

const DEFAULT_CONFIG: DigestViewConfig = {
  sort_by: 'score',
  sort_dir: 'desc',
  group_by: 'subreddit',
  layout_mode: 'columns'
}

export function useRedditDigestConfig(): {
  config: DigestViewConfig
  setConfig: (newConfig: DigestViewConfig) => void
} {
  const [config, setConfigState] = useState<DigestViewConfig>(DEFAULT_CONFIG)

  useEffect(() => {
    window.api
      .invoke('settings:get', 'reddit_digest_view_config')
      .then((raw) => {
        if (raw) {
          try {
            setConfigState(JSON.parse(raw as string) as DigestViewConfig)
          } catch {
            setConfigState(DEFAULT_CONFIG)
          }
        }
      })
      .catch(console.error)
  }, [])

  const setConfig = (newConfig: DigestViewConfig): void => {
    // Optimistic update
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', 'reddit_digest_view_config', JSON.stringify(newConfig))
      .catch(console.error)
  }

  return { config, setConfig }
}
