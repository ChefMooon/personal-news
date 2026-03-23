import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { DigestViewConfig } from '../../../shared/ipc-types'

type LegacyDigestViewConfig = Partial<DigestViewConfig> & {
  subreddit_filter?: string[] | null
}

export const DEFAULT_DIGEST_VIEW_CONFIG: DigestViewConfig = {
  sort_by: 'score',
  sort_dir: 'desc',
  group_by: 'subreddit',
  layout_mode: 'columns',
  subreddit_mode: 'all',
  selected_subreddits: [],
  subreddit_order: [],
  pinned_subreddits: [],
  week_mode: 'latest',
  week_range_count: 4,
  selected_week: null,
  max_posts_per_group: 5,
  hide_viewed: false
}

function normalizeDigestViewConfig(raw: LegacyDigestViewConfig): DigestViewConfig {
  const merged = { ...DEFAULT_DIGEST_VIEW_CONFIG, ...raw }
  if (
    raw.subreddit_mode === 'all' ||
    raw.subreddit_mode === 'selected' ||
    Array.isArray(raw.selected_subreddits) ||
    Array.isArray(raw.subreddit_order) ||
    Array.isArray(raw.pinned_subreddits)
  ) {
    return {
      ...merged,
      subreddit_mode: raw.subreddit_mode === 'selected' ? 'selected' : 'all',
      selected_subreddits: Array.isArray(raw.selected_subreddits) ? raw.selected_subreddits : [],
      subreddit_order: Array.isArray(raw.subreddit_order) ? raw.subreddit_order : [],
      pinned_subreddits: Array.isArray(raw.pinned_subreddits) ? raw.pinned_subreddits : []
    }
  }

  return {
    ...merged,
    subreddit_mode: raw.subreddit_filter === null || raw.subreddit_filter === undefined ? 'all' : 'selected',
    selected_subreddits: Array.isArray(raw.subreddit_filter) ? raw.subreddit_filter : [],
    subreddit_order: [],
    pinned_subreddits: []
  }
}

/**
 * Per-instance Reddit Digest view config.
 * Config is stored under the key `reddit_digest_view_config:<instanceId>`.
 * Falls back to the legacy global key for the first instance so existing
 * users don't lose their saved preferences.
 */
export function useRedditDigestConfig(instanceId: string): {
  config: DigestViewConfig
  setConfig: (newConfig: DigestViewConfig) => void
} {
  const [config, setConfigState] = useState<DigestViewConfig>(DEFAULT_DIGEST_VIEW_CONFIG)
  const storageKey = `reddit_digest_view_config:${instanceId}`

  useEffect(() => {
    // Try per-instance key first, fall back to legacy global key
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState(normalizeDigestViewConfig(JSON.parse(raw as string) as LegacyDigestViewConfig))
            return
          } catch { /* fall through to legacy */ }
        }
        return window.api.invoke('settings:get', 'reddit_digest_view_config').then((legacyRaw) => {
          if (legacyRaw) {
            try {
              setConfigState(normalizeDigestViewConfig(JSON.parse(legacyRaw as string) as LegacyDigestViewConfig))
            } catch { /* use default */ }
          }
        })
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Reddit Digest view settings.')
      })
  }, [instanceId])

  const setConfig = (newConfig: DigestViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Reddit Digest view settings.')
      })
  }

  return { config, setConfig }
}
