// IPC channel name constants and payload types

export const IPC = {
  APP_SHOW_TRAY_HINT: 'app:showTrayHint',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_GET_STATE: 'window:getState',
  WINDOW_STATE_CHANGED: 'window:stateChanged',
  UPDATES_STATUS: 'updates:status',
  UPDATES_GET_STATUS: 'updates:getStatus',
  UPDATES_CHECK_FOR_UPDATES: 'updates:checkForUpdates',
  UPDATES_INSTALL_UPDATE: 'updates:installUpdate',
  WEATHER_SEARCH_LOCATIONS: 'weather:searchLocations',
  WEATHER_GET_LOCATIONS: 'weather:getLocations',
  WEATHER_SAVE_LOCATION: 'weather:saveLocation',
  WEATHER_REMOVE_LOCATION: 'weather:removeLocation',
  WEATHER_GET_SNAPSHOT: 'weather:getSnapshot',
  WEATHER_REFRESH: 'weather:refresh',
  WEATHER_GET_SETTINGS: 'weather:getSettings',
  WEATHER_SET_SETTINGS: 'weather:setSettings',
  WEATHER_GET_STATUS: 'weather:getStatus',
  WEATHER_UPDATED: 'weather:updated',
  SETTINGS_GET_SPORTS_SETTINGS: 'settings:getSportsSettings',
  SETTINGS_UPDATE_SPORTS_SETTINGS: 'settings:updateSportsSettings',
  SPORTS_GET_TODAY_EVENTS: 'sports:getTodayEvents',
  SPORTS_GET_TEAM_EVENTS: 'sports:getTeamEvents',
  SPORTS_GET_TRACKED_TEAMS: 'sports:getTrackedTeams',
  SPORTS_ADD_TEAM: 'sports:addTeam',
  SPORTS_REMOVE_TEAM: 'sports:removeTeam',
  SPORTS_SET_TEAM_ENABLED: 'sports:setTeamEnabled',
  SPORTS_SET_TEAM_ORDER: 'sports:setTeamOrder',
  SPORTS_GET_LEAGUES: 'sports:getLeagues',
  SPORTS_ADD_LEAGUE: 'sports:addLeague',
  SPORTS_REMOVE_LEAGUE: 'sports:removeLeague',
  SPORTS_SEARCH_TEAMS: 'sports:searchTeams',
  SPORTS_REFRESH: 'sports:refresh',
  SPORTS_REFRESH_BADGES: 'sports:refreshBadges',
  SPORTS_GET_STATUS: 'sports:getStatus',
  SPORTS_GET_STANDINGS: 'sports:getStandings',
  SPORTS_GET_EVENT_DETAILS: 'sports:getEventDetails',
  SPORTS_SEARCH_RADIO_STATIONS: 'sports:searchRadioStations',
  SPORTS_RESOLVE_RADIO_STREAM: 'sports:resolveRadioStream',
  SPORTS_DATA_UPDATED: 'sports:dataUpdated',
  SPORTS_FETCH_WARNING: 'sports:fetchWarning',
  YOUTUBE_GET_CHANNELS: 'youtube:getChannels',
  YOUTUBE_GET_VIDEOS: 'youtube:getVideos',
  YOUTUBE_GET_VIDEOS_FILTERED: 'youtube:getVideosFiltered',
  YOUTUBE_SET_CHANNEL_ENABLED: 'youtube:setChannelEnabled',
  YOUTUBE_SET_CHANNEL_NOTIFY: 'youtube:setChannelNotify',
  YOUTUBE_ADD_CHANNEL: 'youtube:addChannel',
  YOUTUBE_REMOVE_CHANNEL: 'youtube:removeChannel',
  YOUTUBE_POLL_NOW: 'youtube:pollNow',
  YOUTUBE_CLEAR_VIDEOS_CACHE: 'youtube:clearVideosCache',
  YOUTUBE_SET_VIDEO_WATCHED: 'youtube:setVideoWatched',
  YOUTUBE_MARK_CHANNEL_WATCHED: 'youtube:markChannelWatched',
  YOUTUBE_VIDEO_WATCHED_CHANGED: 'youtube:videoWatchedChanged',
  YOUTUBE_UPDATED: 'youtube:updated',
  REDDIT_GET_DIGEST_POSTS: 'reddit:getDigestPosts',
  REDDIT_GET_DIGEST_WEEKS: 'reddit:getDigestWeeks',
  REDDIT_SET_DIGEST_POST_VIEWED: 'reddit:setDigestPostViewed',
  REDDIT_BULK_SET_DIGEST_VIEWED: 'reddit:bulkSetDigestViewed',
  REDDIT_GET_DIGEST_VIEWED_ANALYTICS: 'reddit:getDigestViewedAnalytics',
  REDDIT_DIGEST_VIEWED_CHANGED: 'reddit:digestViewedChanged',
  REDDIT_GET_SAVED_POSTS_SUMMARY: 'reddit:getSavedPostsSummary',
  REDDIT_GET_SAVED_POSTS: 'reddit:getSavedPosts',
  REDDIT_SET_SAVED_POST_VIEWED: 'reddit:setSavedPostViewed',
  REDDIT_BULK_SET_SAVED_VIEWED: 'reddit:bulkSetSavedViewed',
  REDDIT_GET_SAVED_VIEWED_ANALYTICS: 'reddit:getSavedViewedAnalytics',
  REDDIT_PRUNE_DIGEST_POSTS: 'reddit:pruneDigestPosts',
  REDDIT_UPDATE_SAVED_POST_NOTE: 'reddit:updateSavedPostNote',
  REDDIT_UPDATE_POST_TAGS: 'reddit:updatePostTags',
  REDDIT_GET_ALL_TAGS: 'reddit:getAllTags',
  REDDIT_RENAME_TAG: 'reddit:renameTag',
  REDDIT_DELETE_TAG: 'reddit:deleteTag',
  REDDIT_VALIDATE_DIGEST_SUBREDDIT: 'reddit:validateDigestSubreddit',
  REDDIT_SYNC_DIGEST_SUBREDDITS: 'reddit:syncDigestSubreddits',
  REDDIT_POLL_NTFY: 'reddit:pollNtfy',
  REDDIT_GET_NTFY_STALENESS: 'reddit:getNtfyStaleness',
  REDDIT_NTFY_INGEST_COMPLETE: 'reddit:ntfyIngestComplete',
  REDDIT_UPDATED: 'reddit:updated',
  REDDIT_CLEAR_SAVED_POSTS: 'reddit:clearSavedPosts',
  REDDIT_DELETE_SAVED_POSTS: 'reddit:deleteSavedPosts',
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
  SETTINGS_GET_DASHBOARD_VIEWS: 'settings:getDashboardViews',
  SETTINGS_SET_DASHBOARD_VIEWS: 'settings:setDashboardViews',
  SETTINGS_GET_SIDEBAR_CONFIG: 'settings:getSidebarConfig',
  SETTINGS_SET_SIDEBAR_CONFIG: 'settings:setSidebarConfig',
  SETTINGS_GET_THEME_SYNC: 'settings:getThemeSync',
  SETTINGS_GET_THEME: 'settings:getTheme',
  SETTINGS_SET_THEME: 'settings:setTheme',
  THEMES_LIST: 'themes:list',
  THEMES_CREATE: 'themes:create',
  THEMES_UPDATE: 'themes:update',
  THEMES_DELETE: 'themes:delete',
  THEMES_EXPORT: 'themes:export',
  THEMES_IMPORT: 'themes:import',
  SETTINGS_GET_YOUTUBE_API_KEY_STATUS: 'settings:getYouTubeApiKeyStatus',
  SETTINGS_SET_YOUTUBE_API_KEY: 'settings:setYouTubeApiKey',
  SETTINGS_CLEAR_YOUTUBE_API_KEY: 'settings:clearYouTubeApiKey',
  SETTINGS_SET_RSS_POLL_INTERVAL: 'settings:setRssPollInterval',
  SETTINGS_SET_NTFY_POLL_INTERVAL: 'settings:setNtfyPollInterval',
  SETTINGS_GET_YOUTUBE_VIEW_CONFIG: 'settings:getYouTubeViewConfig',
  SETTINGS_SET_YOUTUBE_VIEW_CONFIG: 'settings:setYouTubeViewConfig',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_NOTIFICATION_PREFS: 'settings:getNotificationPrefs',
  SETTINGS_SET_NOTIFICATION_PREFS: 'settings:setNotificationPrefs',
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
  notify_new_videos: number
  notify_live_start: number
}

export interface NotificationPreferences {
  desktopNotificationsEnabled: boolean
  weather: {
    badWeather: boolean
  }
  youtube: {
    newVideo: boolean
    liveStart: boolean
  }
  savedPosts: {
    syncSuccess: boolean
  }
  redditDigest: {
    runSuccess: boolean
    runFailure: boolean
  }
  scriptManager: {
    autoRunSuccess: boolean
    autoRunFailure: boolean
    startupWarning: boolean
  }
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
  actual_start_time: number | null
  actual_end_time: number | null
  is_livestream: number
  fetched_at: number
  watched_at: number | null
}

export interface YouTubeVideosFilterOptions {
  channelId?: string
  mediaTypes?: MediaType[]
  search?: string
  sortDir?: 'asc' | 'desc'
  hideWatched?: boolean
  limit?: number
  offset?: number
}

export interface YouTubeVideosFilterResult {
  videos: YtVideo[]
  total: number
}

export interface DigestPost {
  post_id: string
  week_start_date: string
  subreddit: string
  title: string
  url: string
  permalink: string
  author: string | null
  score: number | null
  num_comments: number | null
  created_utc: number
  fetched_at: number
  viewed_at: number | null
}

export interface DigestWeekSummary {
  week_start_date: string
  post_count: number
}

export interface RedditDigestPostsRequest {
  week_start_date?: string | null
  hide_viewed?: boolean
}

export interface RedditDigestBulkSetViewedRequest {
  viewed: boolean
  week_start_date?: string | null
  week_start_dates?: string[]
  subreddit_filter?: string[]
  search?: string
}

export interface RedditDigestViewedAnalyticsRequest {
  week_start_date?: string | null
  week_start_dates?: string[]
  subreddit_filter?: string[]
  search?: string
}

export interface PruneDigestOptions {
  keep_weeks?: number
  delete_week?: string
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

export type ScriptRunTrigger =
  | 'manual'
  | 'scheduled'
  | 'on_app_start'
  | 'catch_up'
  | 'startup_warning'
  | 'reddit_add_sync'

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

export type DashboardIcon =
  | 'layout'
  | 'youtube'
  | 'newspaper'
  | 'bookmark'
  | 'trophy'
  | 'cloud'
  | 'terminal'
  | 'bell'
  | 'star'
  | 'flame'

export interface DashboardView {
  id: string
  name: string
  icon: DashboardIcon | null
  layout: WidgetLayout
}

export interface DashboardViewsState {
  view_order: string[]
  views: Record<string, DashboardView>
}

export interface DashboardConfigCloneOperation {
  sourceInstanceId: string
  targetInstanceId: string
}

export interface DashboardViewsMutation {
  state: DashboardViewsState
  deleteInstanceIds?: string[]
  cloneInstanceConfigs?: DashboardConfigCloneOperation[]
}

export const CUSTOMIZABLE_SIDEBAR_ITEM_IDS = [
  'dashboard',
  'youtube',
  'reddit-digest',
  'saved-posts',
  'sports',
  'scripts'
] as const

export type SidebarItemId = (typeof CUSTOMIZABLE_SIDEBAR_ITEM_IDS)[number]

export interface SidebarConfig {
  itemOrder: SidebarItemId[]
  hiddenItemIds: SidebarItemId[]
}

export const DEFAULT_SIDEBAR_CONFIG: SidebarConfig = {
  itemOrder: [...CUSTOMIZABLE_SIDEBAR_ITEM_IDS],
  hiddenItemIds: []
}

export function isSidebarItemId(value: unknown): value is SidebarItemId {
  return (
    typeof value === 'string' &&
    (CUSTOMIZABLE_SIDEBAR_ITEM_IDS as readonly string[]).includes(value)
  )
}

export function normalizeSidebarConfig(raw: unknown): SidebarConfig {
  const candidate = raw as Partial<SidebarConfig>
  const itemOrder = Array.isArray(candidate.itemOrder)
    ? candidate.itemOrder.filter(isSidebarItemId)
    : []
  const hiddenItemIds = Array.isArray(candidate.hiddenItemIds)
    ? candidate.hiddenItemIds.filter(isSidebarItemId)
    : []

  const dedupedOrder = itemOrder.filter((value, index, values) => values.indexOf(value) === index)
  const dedupedHidden = hiddenItemIds.filter((value, index, values) => values.indexOf(value) === index)
  const missingItemIds = CUSTOMIZABLE_SIDEBAR_ITEM_IDS.filter((itemId) => !dedupedOrder.includes(itemId))

  return {
    itemOrder: [...dedupedOrder, ...missingItemIds],
    hiddenItemIds: dedupedHidden
  }
}

export interface ThemeInfo {
  id: string
  tokens: Record<string, string> | null
}

export interface ThemeRow {
  id: string
  name: string
  tokens: Record<string, string>
  created_at: number
}

export type DesktopPlatform = 'darwin' | 'win32' | 'linux'

export interface WindowState {
  platform: DesktopPlatform
  isMaximized: boolean
  isFullScreen: boolean
}

export interface ThemeImportResult extends IpcMutationResult {
  theme?: ThemeRow
}

export interface YouTubeApiKeyStatus {
  isSet: boolean
  suffix: string | null
}

export interface WeatherLocation {
  id: string
  name: string
  admin1: string | null
  country: string | null
  countryCode: string | null
  latitude: number
  longitude: number
  timezone: string
  createdAt: number
  lastFetchedAt: number | null
}

export interface WeatherSearchResult {
  id: string
  name: string
  admin1: string | null
  country: string | null
  countryCode: string | null
  latitude: number
  longitude: number
  timezone: string
}

export interface WeatherCurrentConditions {
  time: number
  temperature: number | null
  apparentTemperature: number | null
  relativeHumidity: number | null
  precipitation: number | null
  weatherCode: number | null
  isDay: boolean
  windSpeed: number | null
  windGusts: number | null
}

export interface WeatherHourlyPoint {
  time: number
  temperature: number | null
  precipitationProbability: number | null
  weatherCode: number | null
  windSpeed: number | null
  relativeHumidity: number | null
}

export interface WeatherDailyPoint {
  date: string
  weatherCode: number | null
  tempMin: number | null
  tempMax: number | null
  precipitationSum: number | null
  snowfallSum: number | null
  precipitationProbabilityMax: number | null
  windSpeedMax: number | null
  sunrise: number | null
  sunset: number | null
}

export interface WeatherAlert {
  id: string
  kind: 'rain' | 'snow' | 'wind' | 'freeze' | 'heat'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
}

export interface WeatherSnapshot {
  location: WeatherLocation
  fetchedAt: number | null
  stale: boolean
  current: WeatherCurrentConditions | null
  hourly: WeatherHourlyPoint[]
  daily: WeatherDailyPoint[]
  alerts: WeatherAlert[]
}

export interface WeatherAlertThresholds {
  rainMm: number
  snowCm: number
  windKph: number
  freezeTempC: number
  heatTempC: number
}

export interface WeatherSettings {
  pollIntervalMinutes: number
  defaultLocationId: string | null
  temperatureUnit: 'celsius' | 'fahrenheit'
  windSpeedUnit: 'kmh' | 'mph' | 'ms'
  precipitationUnit: 'mm' | 'inch'
  timeFormat: 'system' | '12h' | '24h'
  showAlertsInWidgets: boolean
  thresholds: WeatherAlertThresholds
}

export interface WeatherStatus {
  locationCount: number
  lastFetchedAt: number | null
  staleLocationCount: number
}

export interface WeatherViewConfig {
  locationId: string | null
  detailLevel: 'summary' | 'standard' | 'detailed'
  displayMode: 'current' | 'current_all' | 'current_hourly' | 'current_daily'
  forecastView: 'all' | 'hourly' | 'daily'
  showAlerts: boolean
  showPrecipitation: boolean
  showWind: boolean
  showHumidity: boolean
  showFeelsLike: boolean
  showSunTimes: boolean
}

export interface SportsSettings {
  pollIntervalMinutes: number
  startupRefreshStaleMinutes: number
}

export interface SportEvent {
  eventId: string
  leagueId: string
  sport: string
  homeTeamId: string | null
  awayTeamId: string | null
  homeTeam: string
  awayTeam: string
  homeTeamBadgeUrl: string | null
  awayTeamBadgeUrl: string | null
  homeScore: string | null
  awayScore: string | null
  eventDate: string
  eventTime: string | null
  status: string | null
  venue: string | null
}

export interface SportStandingRow {
  rank: number
  teamId: string
  teamName: string
  played: number
  win: number
  loss: number
  draw: number
  points: number
  goalsFor: number | null
  goalsAgainst: number | null
  goalDifference: number | null
  form: string | null
  description: string | null
  leagueId: string
  season: string
}

export interface SportEventDetail extends SportEvent {
  progress: string | null
  descriptionEN: string | null
}

export interface RadioStation {
  stationuuid: string
  name: string
  urlResolved: string
  playableStreamUrl: string | null
  favicon: string | null
  country: string | null
  countryCode: string | null
  codec: string | null
  bitrate: number | null
  tags: string[]
}

export interface TrackedTeam {
  teamId: string
  leagueId: string
  sport: string
  name: string
  shortName: string | null
  badgeUrl: string | null
  enabled: boolean
  sortOrder: number
}

export interface SportLeague {
  leagueId: string
  sport: string
  name: string
  country: string | null
  logoUrl: string | null
  enabled: boolean
  sortOrder: number
}

export interface TeamSearchResult {
  teamId: string
  name: string
  leagueId: string
  leagueName: string
  sport: string
  badgeUrl: string | null
}

export interface SportsViewConfig {
  sport: string
  viewMode: 'all_games' | 'today' | 'summarized' | 'standard' | 'detailed'
  showVenue: boolean
  showTime: boolean
  showLiveStartTime: boolean
}

export interface SportTeamEvents {
  last: SportEvent[]
  next: SportEvent[]
}

export interface SportSyncStatus {
  sport: string
  lastFetchedAt: number | null
  lastBadgeFetchedAt: number | null
  fetchDate: string | null
  enabledLeagueCount: number
  trackedTeamCount: number
}

export interface SportsDataUpdatedEvent {
  sport: string
  ok: boolean
  error: string | null
}

export interface SportsDataFetchWarningEvent {
  sport: string
  message: string
  severity: 'warning' | 'error'
  timestamp?: number
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
  hideWatched: boolean
  // Per-channel media type overrides
  perChannelMediaOverrides: Record<string, Partial<ChannelMediaOverrides>>
}

export interface IpcMutationResult {
  ok: boolean
  error: string | null
}

export type UpdateStatusState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'

export interface UpdateStatusEvent {
  state: UpdateStatusState
  message: string
  friendlyMessage?: string
  supported: boolean
  currentVersion: string
  version?: string
  releaseDate?: string
  releaseNotes?: string | null
  downloadPercent?: number
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
  scheduledStartAt?: string | null
  actualStartAt?: string | null
  actualEndAt?: string | null
  isLivestream?: boolean
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
  viewed_at: number | null
  note: string | null
  tags: string[]
}

export interface SavedPostsBulkSetViewedRequest {
  viewed: boolean
  search?: string
  subreddit_filter?: string[]
  tag_filter?: string[]
  no_tags_only?: boolean
  source_filter?: LinkSource[]
}

export interface DeleteSavedPostsRequest {
  post_ids: string[]
}

export interface DeleteSavedPostsResult {
  ok: boolean
  error: string | null
  deletedCount: number
}

export interface UpdateSavedPostNoteRequest {
  postId: string
  note: string | null
}

export interface SavedPostsViewedAnalyticsRequest {
  search?: string
  subreddit_filter?: string[]
  tag_filter?: string[]
  no_tags_only?: boolean
  source_filter?: LinkSource[]
}

export interface ViewedTrendPoint {
  day: string
  viewed_count: number
}

export interface ViewedAnalytics {
  total: number
  viewed: number
  unviewed: number
  viewed_rate: number
  trend: ViewedTrendPoint[]
}

export interface DigestViewedChangedEvent {
  post_id: string
  week_start_date: string
  viewed_at: number | null
}

export interface YoutubeVideoWatchedChangedEvent {
  videoId: string
  watchedAt: number | null
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
  subreddit_mode: 'all' | 'selected'
  selected_subreddits: string[]
  subreddit_order: string[]
  pinned_subreddits: string[]
  week_mode: 'latest' | 'range' | 'specific'
  week_range_count: number
  selected_week: string | null
  max_posts_per_group: number
  hide_viewed: boolean
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
  hideViewed: boolean
}

export interface GetSavedPostsRequest {
  search?: string
  subreddit_filter?: string[]
  tag_filter?: string[]
  no_tags_only?: boolean
  source_filter?: LinkSource[]
  hide_viewed?: boolean
  sort_by?: 'saved_at' | 'score'
  sort_dir?: 'asc' | 'desc'
  limit?: number
  offset?: number
}
