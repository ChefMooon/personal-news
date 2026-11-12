import {
  IPC,
  type TrackedTeam,
  type WeatherLocation,
  type YouTubeApiKeyStatus,
  type YtChannel,
} from "../../../shared/ipc-types";
import type { FeatureId } from "../../../shared/feature-manifest";

export interface ReadinessSnapshot {
  weatherLocationCount: number;
  sportsTeamCount: number;
  redditSubredditCount: number;
  youtubeApiKeySet: boolean;
  youtubeChannelCount: number;
  ntfyTopicConfigured: boolean;
}

export function parseRedditSubreddits(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export function getFeatureReadiness(
  id: FeatureId,
  snapshot: ReadinessSnapshot,
): "ready" | "needs_setup" {
  switch (id) {
    case "weather":
    case "astronomy":
      return snapshot.weatherLocationCount > 0 ? "ready" : "needs_setup";
    case "sports":
      return snapshot.sportsTeamCount > 0 ? "ready" : "needs_setup";
    case "reddit_digest":
      return snapshot.redditSubredditCount > 0 ? "ready" : "needs_setup";
    case "youtube":
      return snapshot.youtubeApiKeySet && snapshot.youtubeChannelCount > 0
        ? "ready"
        : "needs_setup";
    case "saved_posts":
      return snapshot.ntfyTopicConfigured ? "ready" : "needs_setup";
  }
}

export async function loadReadinessSnapshot(): Promise<ReadinessSnapshot> {
  const [
    weatherLocationsValue,
    sportsTeamsValue,
    redditSubredditsValue,
    ntfyTopicValue,
    youtubeApiKeyStatusValue,
    youtubeChannelsValue,
  ] = await Promise.all([
    window.api.invoke(IPC.WEATHER_GET_LOCATIONS),
    window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS),
    window.api.invoke(IPC.SETTINGS_GET, "reddit_digest_subreddits"),
    window.api.invoke(IPC.SETTINGS_GET, "ntfy_topic"),
    window.api.invoke(IPC.SETTINGS_GET_YOUTUBE_API_KEY_STATUS),
    window.api.invoke(IPC.YOUTUBE_GET_CHANNELS),
  ]);
  const weatherLocations = weatherLocationsValue as WeatherLocation[];
  const sportsTeams = sportsTeamsValue as TrackedTeam[];
  const youtubeApiKeyStatus =
    youtubeApiKeyStatusValue as YouTubeApiKeyStatus | null;
  const youtubeChannels = youtubeChannelsValue as YtChannel[];

  return {
    weatherLocationCount: Array.isArray(weatherLocations)
      ? weatherLocations.length
      : 0,
    sportsTeamCount: Array.isArray(sportsTeams) ? sportsTeams.length : 0,
    redditSubredditCount: parseRedditSubreddits(redditSubredditsValue).length,
    youtubeApiKeySet: youtubeApiKeyStatus?.isSet === true,
    youtubeChannelCount: Array.isArray(youtubeChannels)
      ? youtubeChannels.length
      : 0,
    ntfyTopicConfigured:
      typeof ntfyTopicValue === "string" && ntfyTopicValue.trim().length > 0,
  };
}
