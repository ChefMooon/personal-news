import { describe, expect, it } from "vitest";
import {
  getFeatureReadiness,
  parseRedditSubreddits,
  type ReadinessSnapshot,
} from "../onboardingReadiness";

const readySnapshot: ReadinessSnapshot = {
  weatherLocationCount: 1,
  sportsTeamCount: 1,
  redditSubredditCount: 1,
  youtubeApiKeySet: true,
  youtubeChannelCount: 1,
  ntfyTopicConfigured: true,
};

describe("getFeatureReadiness", () => {
  it("uses each feature's saved setup data", () => {
    expect(getFeatureReadiness("weather", readySnapshot)).toBe("ready");
    expect(getFeatureReadiness("astronomy", readySnapshot)).toBe("ready");
    expect(getFeatureReadiness("sports", readySnapshot)).toBe("ready");
    expect(getFeatureReadiness("reddit_digest", readySnapshot)).toBe("ready");
    expect(getFeatureReadiness("youtube", readySnapshot)).toBe("ready");
    expect(getFeatureReadiness("saved_posts", readySnapshot)).toBe("ready");
  });

  it("requires both a YouTube key and at least one channel", () => {
    expect(
      getFeatureReadiness("youtube", {
        ...readySnapshot,
        youtubeApiKeySet: false,
      }),
    ).toBe("needs_setup");
    expect(
      getFeatureReadiness("youtube", {
        ...readySnapshot,
        youtubeChannelCount: 0,
      }),
    ).toBe("needs_setup");
  });

  it("shares saved Weather locations with Astronomy readiness", () => {
    const snapshot = { ...readySnapshot, weatherLocationCount: 0 };
    expect(getFeatureReadiness("weather", snapshot)).toBe("needs_setup");
    expect(getFeatureReadiness("astronomy", snapshot)).toBe("needs_setup");
  });

  it("reports missing feature setup data", () => {
    const snapshot: ReadinessSnapshot = {
      weatherLocationCount: 0,
      sportsTeamCount: 0,
      redditSubredditCount: 0,
      youtubeApiKeySet: false,
      youtubeChannelCount: 0,
      ntfyTopicConfigured: false,
    };
    for (const id of [
      "weather",
      "astronomy",
      "sports",
      "reddit_digest",
      "youtube",
      "saved_posts",
    ] as const) {
      expect(getFeatureReadiness(id, snapshot)).toBe("needs_setup");
    }
  });
});

describe("parseRedditSubreddits", () => {
  it("parses non-empty subreddit names from a JSON array", () => {
    expect(parseRedditSubreddits('["news", " technology ", "", 2, null]')).toEqual([
      "news",
      " technology ",
    ]);
  });

  it("returns an empty list for invalid or non-array settings", () => {
    expect(parseRedditSubreddits(null)).toEqual([]);
    expect(parseRedditSubreddits("")).toEqual([]);
    expect(parseRedditSubreddits("{not json")).toEqual([]);
    expect(parseRedditSubreddits('{"subreddit":"news"}')).toEqual([]);
  });
});
