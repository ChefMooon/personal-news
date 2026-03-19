import { useState, useEffect } from 'react'
import type { SavedPostsViewConfig } from '../../../shared/ipc-types'

const DEFAULT_CONFIG: SavedPostsViewConfig = {
  subreddit_filter: null,
  tag_filter: null,
  sort_by: 'saved_at',
  sort_dir: 'desc',
  max_posts: 5,
  showMetadata: true,
  cardDensity: 'compact',
  showBodyPreview: false,
  showViewAllLink: true
}

/**
 * Per-instance Saved Posts widget view config.
 * Config is stored under the key `saved_posts_view_config:<instanceId>`.
 */
export function useSavedPostsConfig(instanceId: string): {
  config: SavedPostsViewConfig
  setConfig: (newConfig: SavedPostsViewConfig) => void
} {
  const [config, setConfigState] = useState<SavedPostsViewConfig>(DEFAULT_CONFIG)
  const storageKey = `saved_posts_view_config:${instanceId}`

  useEffect(() => {
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState({
              ...DEFAULT_CONFIG,
              ...(JSON.parse(raw as string) as Partial<SavedPostsViewConfig>)
            })
          } catch {
            // Use default on parse error
          }
        }
      })
      .catch(console.error)
  }, [instanceId])

  const setConfig = (newConfig: SavedPostsViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch(console.error)
  }

  return { config, setConfig }
}
