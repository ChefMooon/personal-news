export const FEATURE_IDS = [
  "youtube",
  "reddit_digest",
  "saved_posts",
  "sports",
  "weather",
  "astronomy",
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export function isFeatureId(value: unknown): value is FeatureId {
  return typeof value === "string" && FEATURE_IDS.some((id) => id === value);
}

export type FeatureStorage =
  | { kind: "setting"; key: string }
  | { kind: "astronomy_settings_json"; key: "astronomy_settings_json" };

export interface FeatureManifestEntry {
  id: FeatureId;
  displayName: string;
  blurb: string;
  needsSetup: boolean;
  setupHint: string | null;
  enabledWhenUnset: boolean;
  settingsTabId: string;
  storage: FeatureStorage;
}

export const FEATURE_MANIFEST: readonly FeatureManifestEntry[] = [
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
];

export function getFeatureEntry(id: FeatureId): FeatureManifestEntry {
  return FEATURE_MANIFEST.find((entry) => entry.id === id)!;
}

export function getFeatureIdForSettingKey(key: string): FeatureId | null {
  const entry = FEATURE_MANIFEST.find(
    (candidate) =>
      candidate.storage.kind === "setting" && candidate.storage.key === key,
  );
  return entry?.id ?? null;
}

export function isFeatureFlagValueEnabled(
  raw: string | null,
  entry: FeatureManifestEntry,
): boolean {
  return raw === null ? entry.enabledWhenUnset : raw !== "false";
}

export function isSelectedByDefault(entry: FeatureManifestEntry): boolean {
  return !entry.needsSetup;
}
