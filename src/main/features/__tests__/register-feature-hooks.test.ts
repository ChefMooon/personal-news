import { afterEach, describe, expect, it, vi } from "vitest";
import { FEATURE_IDS } from "../../../shared/feature-manifest";

const hooks = vi.hoisted(() => ({
  astronomy: vi.fn(),
  database: {},
  redditDigest: vi.fn(),
  savedPosts: vi.fn(),
  sports: vi.fn(),
  weather: vi.fn(),
  youtube: vi.fn(),
}));

vi.mock("../../db/database", () => ({
  getDb: () => hooks.database,
}));
vi.mock("../../sources/astronomy", () => ({
  applyAstronomyEnabled: hooks.astronomy,
}));
vi.mock("../../sources/reddit", () => ({
  applySavedPostsEnabled: hooks.savedPosts,
}));
vi.mock("../../sources/scripts", () => ({
  applyRedditDigestEnabled: hooks.redditDigest,
}));
vi.mock("../../sources/sports", () => ({
  applySportsEnabled: hooks.sports,
}));
vi.mock("../../sources/weather", () => ({
  applyWeatherEnabled: hooks.weather,
}));
vi.mock("../../sources/youtube", () => ({
  applyYouTubeEnabled: hooks.youtube,
}));

import { dispatchFeatureEnabledChange } from "../feature-dispatcher";
import { clearFeatureHooks } from "../feature-dispatcher";
import { registerFeatureHooks } from "../register-feature-hooks";

afterEach(() => {
  clearFeatureHooks();
  Object.values(hooks).forEach((hook) => {
    if (typeof hook === "function" && "mockClear" in hook) hook.mockClear();
  });
});

describe("registerFeatureHooks", () => {
  it("registers every manifest feature and their corresponding hook", () => {
    expect(() => registerFeatureHooks()).not.toThrow();

    for (const id of FEATURE_IDS) {
      expect(dispatchFeatureEnabledChange(id, true, false)).toBe(true);
    }

    expect(hooks.youtube).toHaveBeenCalledWith(true);
    expect(hooks.savedPosts).toHaveBeenCalledWith(true);
    expect(hooks.sports).toHaveBeenCalledWith(true);
    expect(hooks.weather).toHaveBeenCalledWith(true);
    expect(hooks.astronomy).toHaveBeenCalledWith(true);
    expect(hooks.redditDigest).toHaveBeenCalledWith(hooks.database, true);
  });
});
