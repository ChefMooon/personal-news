import { useState, useEffect } from 'react'
import type { DigestViewConfig } from '../../../shared/ipc-types'

const DEFAULT_CONFIG: DigestViewConfig = {
  sort_by: 'score',
  sort_dir: 'desc',
  group_by: 'subreddit',
  layout_mode: 'columns',
  subreddit_filter: null
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
  const [config, setConfigState] = useState<DigestViewConfig>(DEFAULT_CONFIG)
  const storageKey = `reddit_digest_view_config:${instanceId}`

  useEffect(() => {
    // Try per-instance key first, fall back to legacy global key
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState({ ...DEFAULT_CONFIG, ...(JSON.parse(raw as string) as Partial<DigestViewConfig>) })
            return
          } catch { /* fall through to legacy */ }
        }
        return window.api.invoke('settings:get', 'reddit_digest_view_config').then((legacyRaw) => {
          if (legacyRaw) {
            try {
              setConfigState({ ...DEFAULT_CONFIG, ...(JSON.parse(legacyRaw as string) as Partial<DigestViewConfig>) })
            } catch { /* use default */ }
          }
        })
      })
      .catch(console.error)
  }, [instanceId])

  const setConfig = (newConfig: DigestViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch(console.error)
  }

  return { config, setConfig }
}
