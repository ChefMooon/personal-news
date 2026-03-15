// IPC channel name constants and payload types

export const IPC = {
  YOUTUBE_GET_CHANNELS: 'youtube:getChannels',
  YOUTUBE_GET_VIDEOS: 'youtube:getVideos',
  YOUTUBE_UPDATED: 'youtube:updated',
  REDDIT_GET_DIGEST_POSTS: 'reddit:getDigestPosts',
  REDDIT_GET_SAVED_POSTS_SUMMARY: 'reddit:getSavedPostsSummary',
  SCRIPTS_GET_ALL: 'scripts:getAll',
  SETTINGS_GET_WIDGET_LAYOUT: 'settings:getWidgetLayout',
  SETTINGS_SET_WIDGET_LAYOUT: 'settings:setWidgetLayout',
  SETTINGS_GET_THEME: 'settings:getTheme',
  SETTINGS_SET_THEME: 'settings:setTheme',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal'
} as const

export interface YtChannel {
  channel_id: string
  name: string
  thumbnail_url: string | null
  added_at: number
  enabled: number
  sort_order: number
}

export interface YtVideo {
  video_id: string
  channel_id: string
  title: string
  published_at: number
  thumbnail_url: string | null
  duration_sec: number | null
  broadcast_status: 'none' | 'upcoming' | 'live' | null
  scheduled_start: number | null
  fetched_at: number
}

export interface DigestPost {
  post_id: string
  subreddit: string
  title: string
  url: string
  permalink: string
  author: string | null
  score: number | null
  num_comments: number | null
  created_utc: number
  fetched_at: number
}

export interface SavedPostSummary {
  post_id: string
  title: string
  permalink: string
  subreddit: string | null
  saved_at: number
}

export interface ScriptWithLastRun {
  id: number
  name: string
  file_path: string
  interpreter: string
  args: string | null
  schedule: string | null
  enabled: number
  created_at: number
  started_at: number | null
  finished_at: number | null
  exit_code: number | null
}

export interface WidgetLayout {
  widget_order: string[]
  widget_visibility: Record<string, boolean>
}

export interface ThemeInfo {
  id: string
  tokens: Record<string, string> | null
}

export interface DigestViewConfig {
  sort_by: 'score' | 'num_comments' | 'created_utc' | 'fetched_at'
  sort_dir: 'asc' | 'desc'
  group_by: 'subreddit' | 'none'
  layout_mode: 'columns' | 'tabs'
}
