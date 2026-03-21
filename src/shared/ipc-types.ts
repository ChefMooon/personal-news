// IPC channel name constants and payload types

export const IPC = {
  YOUTUBE_GET_CHANNELS: 'youtube:getChannels',
  YOUTUBE_GET_VIDEOS: 'youtube:getVideos',
  YOUTUBE_SET_CHANNEL_ENABLED: 'youtube:setChannelEnabled',
  YOUTUBE_ADD_CHANNEL: 'youtube:addChannel',
  YOUTUBE_REMOVE_CHANNEL: 'youtube:removeChannel',
  YOUTUBE_POLL_NOW: 'youtube:pollNow',
  YOUTUBE_CLEAR_VIDEOS_CACHE: 'youtube:clearVideosCache',
  YOUTUBE_UPDATED: 'youtube:updated',
  REDDIT_GET_DIGEST_POSTS: 'reddit:getDigestPosts',
  REDDIT_GET_SAVED_POSTS_SUMMARY: 'reddit:getSavedPostsSummary',
  REDDIT_GET_SAVED_POSTS: 'reddit:getSavedPosts',
  REDDIT_UPDATE_POST_TAGS: 'reddit:updatePostTags',
  REDDIT_GET_ALL_TAGS: 'reddit:getAllTags',
  REDDIT_RENAME_TAG: 'reddit:renameTag',
  REDDIT_DELETE_TAG: 'reddit:deleteTag',
  REDDIT_VALIDATE_DIGEST_SUBREDDIT: 'reddit:validateDigestSubreddit',
  REDDIT_POLL_NTFY: 'reddit:pollNtfy',
  REDDIT_GET_NTFY_STALENESS: 'reddit:getNtfyStaleness',
  REDDIT_NTFY_INGEST_COMPLETE: 'reddit:ntfyIngestComplete',
  REDDIT_UPDATED: 'reddit:updated',
  REDDIT_CLEAR_SAVED_POSTS: 'reddit:clearSavedPosts',
  SCRIPTS_GET_ALL: 'scripts:getAll',
  SCRIPTS_RUN: 'scripts:run',
  SCRIPTS_CANCEL: 'scripts:cancel',
  SCRIPTS_UPDATE: 'scripts:update',
  SCRIPTS_SET_SCHEDULE: 'scripts:setSchedule',
  SCRIPTS_SET_ENABLED: 'scripts:setEnabled',
  SCRIPTS_GET_RUN_HISTORY: 'scripts:getRunHistory',
  SCRIPTS_GET_NOTIFICATIONS: 'scripts:getNotifications',
  SCRIPTS_MARK_NOTIFICATIONS_READ: 'scripts:markNotificationsRead',
  SCRIPTS_OUTPUT: 'scripts:output',
  SCRIPTS_RUN_COMPLETE: 'scripts:runComplete',
  SCRIPTS_UPDATED: 'scripts:updated',
  SETTINGS_GET_WIDGET_LAYOUT: 'settings:getWidgetLayout',
  SETTINGS_SET_WIDGET_LAYOUT: 'settings:setWidgetLayout',
  SETTINGS_GET_THEME: 'settings:getTheme',
  SETTINGS_SET_THEME: 'settings:setTheme',
  SETTINGS_GET_YOUTUBE_API_KEY_STATUS: 'settings:getYouTubeApiKeyStatus',
  SETTINGS_SET_YOUTUBE_API_KEY: 'settings:setYouTubeApiKey',
  SETTINGS_CLEAR_YOUTUBE_API_KEY: 'settings:clearYouTubeApiKey',
  SETTINGS_SET_RSS_POLL_INTERVAL: 'settings:setRssPollInterval',
  SETTINGS_SET_NTFY_POLL_INTERVAL: 'settings:setNtfyPollInterval',
  SETTINGS_GET_YOUTUBE_VIEW_CONFIG: 'settings:getYouTubeViewConfig',
  SETTINGS_SET_YOUTUBE_VIEW_CONFIG: 'settings:setYouTubeViewConfig',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
  SHELL_OPEN_PATH: 'shell:openPath',
  DIALOG_SHOW_OPEN_FOLDER: 'dialog:showOpenFolder'
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
  media_type: MediaType | null
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

export type LinkSource = 'reddit' | 'x' | 'bsky' | 'generic'

export interface SavedPostSummary {
  post_id: string
  title: string
  permalink: string
  subreddit: string | null
  source: LinkSource
  saved_at: number
}

export interface ScriptWithLastRun {
  id: number
  name: string
  description: string | null
  file_path: string
  interpreter: string
  args: string | null
  schedule: string | null
  enabled: number
  created_at: number
  started_at: number | null
  finished_at: number | null
  exit_code: number | null
  is_stale: boolean
}

export interface ScriptRunRecord {
  id: number
  script_id: number
  started_at: number
  finished_at: number | null
  exit_code: number | null
  stdout: string | null
  stderr: string | null
}

export interface ScriptOutputChunk {
  runId: number
  stream: 'stdout' | 'stderr'
  text: string
}

export type ScriptRunTrigger = 'manual' | 'scheduled' | 'on_app_start' | 'catch_up' | 'startup_warning'

export interface ScriptRunCompleteEvent {
  kind: 'run_complete' | 'startup_warning'
  scriptId: number
  scriptName: string
  runId: number | null
  startedAt: number | null
  finishedAt: number
  exitCode: number | null
  trigger: ScriptRunTrigger
  severity: 'info' | 'warning' | 'error'
  message: string
  missedRuns: number | null
  downtimeSeconds: number | null
}

export interface ScriptNotification {
  id: number
  script_id: number
  run_id: number | null
  severity: 'info' | 'warning' | 'error'
  message: string
  is_read: number
  created_at: number
  read_at: number | null
}

export interface ScriptNotificationsReadResult extends IpcMutationResult {
  updatedCount: number
}

export interface ScriptScheduleInput {
  type: 'manual' | 'on_app_start' | 'interval' | 'daily' | 'weekly' | 'monthly' | 'fixed_time'
  minutes?: number
  runOnAppStart?: boolean
  hour?: number
  minute?: number
  daysOfWeek?: number[]
  dayOfMonth?: number
}

export interface ScriptUpdateInput {
  id: number
  name: string
  description: string | null
  file_path: string
  interpreter: string
  args: string | null
  schedule: ScriptScheduleInput
  enabled: boolean
}

export interface WidgetInstance {
  instanceId: string
  moduleId: string
  label: string | null
}

export interface WidgetLayout {
  widget_order: string[]
  widget_visibility: Record<string, boolean>
  widget_instances: Record<string, WidgetInstance>
}

export interface ThemeInfo {
  id: string
  tokens: Record<string, string> | null
}

export interface YouTubeApiKeyStatus {
  isSet: boolean
  suffix: string | null
}

export interface ChannelMediaOverrides {
  showVideos: boolean
  showShorts: boolean
  showUpcomingStreams: boolean
  showLiveNow: boolean
  showPastLivestreams: boolean
}

export interface YouTubeViewConfig {
  // Media type filters
  showVideos: boolean
  showShorts: boolean
  showUpcomingStreams: boolean
  showLiveNow: boolean
  showPastLivestreams: boolean
  // Channel selection & order (per widget instance)
  channelMode: 'all' | 'selected'
  selectedChannelIds: string[]
  channelOrder: string[]
  pinnedChannelIds: string[]
  // Stream panel
  showUpcomingPanel: boolean
  // Layout & display
  maxVideosPerChannel: number
  videoSortDirection: 'newest' | 'oldest'
  cardDensity: 'compact' | 'detailed'
  showChannelHeaders: boolean
  collapseChannelsByDefault: boolean
  // Per-channel media type overrides
  perChannelMediaOverrides: Record<string, Partial<ChannelMediaOverrides>>
}

export interface IpcMutationResult {
  ok: boolean
  error: string | null
}

export interface YouTubeCacheClearResult extends IpcMutationResult {
  deletedCount: number
}

export type MediaType = 'short' | 'video' | 'upcoming_stream' | 'live'

export interface NormalizedFeedChannelInfo {
  id: string
  title: string
  url: string
  publishedAt: string | null
}

export interface NormalizedFeedEntry {
  id: string
  title: string
  url: string
  publishedAt: string | null
  updatedAt: string | null
  thumbnailUrl: string | null
  thumbnailWidth: number | null
  thumbnailHeight: number | null
  description: string | null
  viewCount: number
  ratingCount: number
  ratingAverage: number
  mediaType: MediaType
  mediaTypeConfidence?: 'high' | 'low'
  durationSeconds?: number | null
  channelId?: string
}

export interface ParsedFeed {
  channel: NormalizedFeedChannelInfo
  entries: NormalizedFeedEntry[]
  parsedAt: string
}

export interface SavedPost {
  post_id: string
  title: string
  url: string
  permalink: string
  subreddit: string | null
  author: string | null
  score: number | null
  body: string | null
  source: LinkSource
  saved_at: number
  note: string | null
  tags: string[]
}

export interface SavedPostInput {
  postId: string
  title: string
  url: string
  permalink: string
  subreddit: string | null
  author: string | null
  score: number | null
  body: string | null
  source: LinkSource
  savedAt: number
  note: string | null
  tags: null
}

export interface NtfyStaleness {
  lastPolledAt: number | null
  isStale: boolean
  topicConfigured: boolean
}

export interface NtfyPollResult {
  postsIngested: number
  messagesReceived: number
  lastPolledAt: number
}

export interface DigestViewConfig {
  sort_by: 'score' | 'num_comments' | 'created_utc' | 'fetched_at'
  sort_dir: 'asc' | 'desc'
  group_by: 'subreddit' | 'none'
  layout_mode: 'columns' | 'tabs'
  subreddit_filter: string[] | null
}

export interface SavedPostsViewConfig {
  // Filtering
  subreddit_filter: string[] | null
  tag_filter: string[] | null
  source_filter: LinkSource[] | null
  // Sorting & pagination
  sort_by: 'saved_at' | 'score'
  sort_dir: 'asc' | 'desc'
  max_posts: number
  // Grouping
  group_by: 'none' | 'source'
  showGroupHeaders: boolean
  sourceOrder: LinkSource[]
  // Presentation
  showMetadata: boolean
  showSourceBadge: boolean
  showUrl: boolean
  cardDensity: 'compact' | 'detailed'
  showBodyPreview: boolean
  showViewAllLink: boolean
}

export interface GetSavedPostsRequest {
  search?: string
  subreddit_filter?: string[]
  tag_filter?: string[]
  source_filter?: LinkSource[]
  sort_by?: 'saved_at' | 'score'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
