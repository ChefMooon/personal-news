import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMap = new Map<string, string>();
vi.mock("../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
}));

import { isFeatureEnabled } from "../feature-state";

beforeEach(() => {
  settingsMap.clear();
});

describe("isFeatureEnabled", () => {
  it("defaults setting-backed features to enabled when unset", () => {
    expect(isFeatureEnabled("youtube")).toBe(true);
  });

  it("reads setting-backed feature flags using the false-string convention", () => {
    settingsMap.set("youtube_enabled", "false");
    expect(isFeatureEnabled("youtube")).toBe(false);

    settingsMap.set("youtube_enabled", "true");
    expect(isFeatureEnabled("youtube")).toBe(true);
  });

  it("defaults Astronomy to enabled when its settings row is absent", () => {
    expect(isFeatureEnabled("astronomy")).toBe(true);
  });

  it("reads the Astronomy enabled field from stored settings", () => {
    settingsMap.set("astronomy_settings_json", '{"enabled":false}');
    expect(isFeatureEnabled("astronomy")).toBe(false);
  });

  it("defaults Astronomy to enabled when stored JSON is malformed", () => {
    settingsMap.set("astronomy_settings_json", "{not json");
    expect(isFeatureEnabled("astronomy")).toBe(true);
  });
});
