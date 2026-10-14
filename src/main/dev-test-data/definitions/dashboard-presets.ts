import type {
  DashboardIcon,
  DigestViewConfig,
  SavedPostsViewConfig,
  SportsViewConfig,
  WeatherViewConfig,
  WidgetSize,
  YouTubeViewConfig,
} from "../../../shared/ipc-types";
import { YOUTUBE_FIXTURE_CHANNEL_IDS } from "./youtube";
import { WEATHER_FIXTURE_LOCATION_ID } from "./weather";
import { ALL_SPORTS_ID } from "../../../shared/sports";
import { REDDIT_DIGEST_FIXTURE_SUBREDDITS } from "./reddit-digest";
import { SAVED_POST_FIXTURE_SUBREDDITS } from "./saved-posts";

interface PresetConfigs {
  youtube: Partial<YouTubeViewConfig>;
  reddit_digest: Partial<DigestViewConfig>;
  saved_posts: Partial<SavedPostsViewConfig>;
  sports: Partial<SportsViewConfig>;
  weather: Partial<WeatherViewConfig>;
  astronomy: { locationId: string; viewMode: "summary" | "detailed" };
}

type DashboardPreset = {
  [Module in keyof PresetConfigs]: {
    moduleId: Module;
    name: string;
    icon: DashboardIcon;
    config: PresetConfigs[Module];
  };
}[keyof PresetConfigs];

// Edit the six example dashboards here; persistence and ownership live separately.
export const DASHBOARD_FIXTURE_PRESETS: readonly DashboardPreset[] = [
  {
    moduleId: "youtube",
    name: "YouTube",
    icon: "youtube",
    config: {
      channelMode: "selected",
      selectedChannelIds: [...YOUTUBE_FIXTURE_CHANNEL_IDS],
      channelOrder: [...YOUTUBE_FIXTURE_CHANNEL_IDS],
      pinnedChannelIds: [],
      showVideos: true,
      showShorts: true,
      showLiveNow: true,
      showUpcomingStreams: true,
      showPastLivestreams: true,
      hideWatched: false,
      maxVideosPerChannel: 15,
      perChannelMediaOverrides: {},
      showChannelHeaders: true,
      collapseChannelsByDefault: false,
    },
  },
  {
    moduleId: "reddit_digest",
    name: "Reddit Digest",
    icon: "newspaper",
    config: {
      subreddit_mode: "selected",
      selected_subreddits: [...REDDIT_DIGEST_FIXTURE_SUBREDDITS],
      subreddit_order: [],
      pinned_subreddits: [],
      week_mode: "range",
      week_range_count: 4,
      selected_week: null,
      hide_viewed: false,
      max_posts_per_group: 10,
      group_by: "subreddit",
      layout_mode: "columns",
      sort_by: "score",
      sort_dir: "desc",
    },
  },
  {
    moduleId: "saved_posts",
    name: "Saved Posts",
    icon: "bookmark",
    config: {
      subreddit_filter: [...SAVED_POST_FIXTURE_SUBREDDITS],
      tag_filter: null,
      source_filter: null,
      hideViewed: false,
      max_posts: 6,
      showBodyPreview: true,
      showMetadata: true,
      group_by: "none",
      sort_by: "saved_at",
      sort_dir: "desc",
    },
  },
  {
    moduleId: "sports",
    name: "Sports",
    icon: "trophy",
    config: {
      sport: ALL_SPORTS_ID,
      viewMode: "detailed",
      showVenue: true,
      showTime: true,
      showLiveStartTime: true,
    },
  },
  {
    moduleId: "weather",
    name: "Weather",
    icon: "cloud",
    config: {
      locationId: WEATHER_FIXTURE_LOCATION_ID,
      displayMode: "current_all",
      detailLevel: "detailed",
      showAlerts: true,
      showAstronomy: true,
    },
  },
  {
    moduleId: "astronomy",
    name: "Astronomy",
    icon: "star",
    config: { locationId: WEATHER_FIXTURE_LOCATION_ID, viewMode: "detailed" },
  },
];

export const DASHBOARD_FIXTURE_SIZES: readonly WidgetSize[] = [
  "small",
  "medium",
  "large",
];

export function fixtureViewId(moduleId: string): string {
  return `pn_dev_fixture_dashboard_${moduleId}`;
}

export function fixtureWidgetId(moduleId: string, size: WidgetSize): string {
  return `pn_dev_fixture_widget_${moduleId}_${size}`;
}

export function fixtureConfigKey(moduleId: string, instanceId: string): string {
  return `${moduleId}_view_config:${instanceId}`;
}
