import { describe, expect, it } from "vitest";
import { WIDGET_FOOTPRINTS } from "../dashboard-grid";
import {
  FEATURE_IDS,
  FEATURE_MANIFEST,
  getFeatureEntry,
  getFeatureIdForSettingKey,
  isFeatureFlagValueEnabled,
  isFeatureId,
  isSelectedByDefault,
} from "../feature-manifest";

describe("feature manifest", () => {
  it("defines one entry for each feature id with the expected setup defaults", () => {
    const ids = FEATURE_MANIFEST.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(FEATURE_IDS);
    expect(
      FEATURE_MANIFEST.filter((entry) => entry.needsSetup).map(
        (entry) => entry.id,
      ),
    ).toEqual(["youtube", "saved_posts"]);
    expect(FEATURE_MANIFEST.every((entry) => entry.enabledWhenUnset)).toBe(
      true,
    );
    expect(
      FEATURE_MANIFEST.filter(isSelectedByDefault).map((entry) => entry.id),
    ).toEqual(["reddit_digest", "sports", "weather", "astronomy"]);
    expect(isFeatureId("scripts")).toBe(false);
    expect(isFeatureId("youtube")).toBe(true);
    expect(FEATURE_IDS).not.toContain("scripts");
    expect(Object.keys(WIDGET_FOOTPRINTS).sort()).toEqual(
      [...FEATURE_IDS].sort(),
    );
  });

  it("contains the planned labels, descriptions, settings tabs, and storage keys", () => {
    expect(FEATURE_MANIFEST).toEqual([
      {
        id: "youtube",
        displayName: "YouTube",
        blurb:
          "Follow your favorite channels and see new videos and live streams in one place.",
        needsSetup: true,
        setupHint: "Needs a free Google API key.",
        enabledWhenUnset: true,
        settingsTabId: "youtube",
        storage: { kind: "setting", key: "youtube_enabled" },
      },
      {
        id: "reddit_digest",
        displayName: "Reddit Digest",
        blurb: "A weekly digest of top posts from the subreddits you choose.",
        needsSetup: false,
        setupHint: null,
        enabledWhenUnset: true,
        settingsTabId: "reddit-digest",
        storage: { kind: "setting", key: "reddit_digest_enabled" },
      },
      {
        id: "saved_posts",
        displayName: "Saved Posts",
        blurb: "Save Reddit and web links from your phone and read them later.",
        needsSetup: true,
        setupHint: "Needs the ntfy phone app and a topic.",
        enabledWhenUnset: true,
        settingsTabId: "saved-posts",
        storage: { kind: "setting", key: "saved_posts_enabled" },
      },
      {
        id: "sports",
        displayName: "Sports",
        blurb: "Scores, schedules, and standings for the teams you follow.",
        needsSetup: false,
        setupHint: null,
        enabledWhenUnset: true,
        settingsTabId: "sports",
        storage: { kind: "setting", key: "sports_enabled" },
      },
      {
        id: "weather",
        displayName: "Weather",
        blurb:
          "Current conditions, forecasts, and alerts for your saved locations.",
        needsSetup: false,
        setupHint: null,
        enabledWhenUnset: true,
        settingsTabId: "weather",
        storage: { kind: "setting", key: "weather_enabled" },
      },
      {
        id: "astronomy",
        displayName: "Astronomy",
        blurb:
          "Sun, moon, and planet times for your saved locations. Uses your Weather locations.",
        needsSetup: false,
        setupHint: null,
        enabledWhenUnset: true,
        settingsTabId: "astronomy",
        storage: {
          kind: "astronomy_settings_json",
          key: "astronomy_settings_json",
        },
      },
    ]);
    expect(getFeatureEntry("youtube")).toBe(FEATURE_MANIFEST[0]);
  });

  it("maps setting storage keys to feature ids only", () => {
    expect(getFeatureIdForSettingKey("youtube_enabled")).toBe("youtube");
    expect(getFeatureIdForSettingKey("astronomy_settings_json")).toBeNull();
  });

  it("uses the established false-string flag convention", () => {
    for (const entry of FEATURE_MANIFEST) {
      expect(isFeatureFlagValueEnabled(null, entry)).toBe(
        entry.enabledWhenUnset,
      );
      expect(isFeatureFlagValueEnabled("false", entry)).toBe(false);
      expect(isFeatureFlagValueEnabled("true", entry)).toBe(true);
      expect(isFeatureFlagValueEnabled("0", entry)).toBe(true);
    }
  });
});
