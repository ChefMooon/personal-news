import { describe, expect, it } from "vitest";
import { getFeatureEntry } from "../../../../shared/feature-manifest";
import type { ReadinessSnapshot } from "../../lib/onboardingReadiness";
import { shouldShowNeedsSetup } from "../FeaturesSettingsTab";

const readySnapshot: ReadinessSnapshot = {
  weatherLocationCount: 1,
  sportsTeamCount: 1,
  redditSubredditCount: 1,
  youtubeApiKeySet: true,
  youtubeChannelCount: 1,
  ntfyTopicConfigured: true,
};

describe("shouldShowNeedsSetup", () => {
  it("hides the YouTube badge when its key and channel are configured", () => {
    expect(
      shouldShowNeedsSetup(getFeatureEntry("youtube"), true, readySnapshot),
    ).toBe(false);
  });

  it("shows the YouTube badge when setup is incomplete", () => {
    expect(
      shouldShowNeedsSetup(getFeatureEntry("youtube"), true, {
        ...readySnapshot,
        youtubeApiKeySet: false,
      }),
    ).toBe(true);
  });

  it("hides the badge for a disabled feature", () => {
    expect(
      shouldShowNeedsSetup(getFeatureEntry("youtube"), false, {
        ...readySnapshot,
        youtubeApiKeySet: false,
      }),
    ).toBe(false);
  });
});
