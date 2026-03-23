import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { SavedPostsViewConfig } from '../../../shared/ipc-types'

export const DEFAULT_SAVED_POSTS_VIEW_CONFIG: SavedPostsViewConfig = {
  subreddit_filter: null,
  tag_filter: null,
  source_filter: null,
  sort_by: 'saved_at',
  sort_dir: 'desc',
  max_posts: 5,
  group_by: 'none',
  showGroupHeaders: true,
  sourceOrder: ['reddit', 'x', 'bsky', 'generic'],
  showMetadata: true,
  showSourceBadge: true,
  showUrl: false,
  cardDensity: 'compact',
  showBodyPreview: false,
  showViewAllLink: true,
  hideViewed: false
}

/**
 * Per-instance Saved Posts widget view config.
 * Config is stored under the key `saved_posts_view_config:<instanceId>`.
 */
export function useSavedPostsConfig(instanceId: string): {
  config: SavedPostsViewConfig
  setConfig: (newConfig: SavedPostsViewConfig) => void
} {
  const [config, setConfigState] = useState<SavedPostsViewConfig>(DEFAULT_SAVED_POSTS_VIEW_CONFIG)
  const storageKey = `saved_posts_view_config:${instanceId}`

  useEffect(() => {
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState({
              ...DEFAULT_SAVED_POSTS_VIEW_CONFIG,
              ...(JSON.parse(raw as string) as Partial<SavedPostsViewConfig>)
            })
          } catch {
            // Use default on parse error
          }
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Saved Posts view settings.')
      })
  }, [instanceId])

  const setConfig = (newConfig: SavedPostsViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Saved Posts view settings.')
      })
  }

  return { config, setConfig }
}
