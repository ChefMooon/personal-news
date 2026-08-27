import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASTRONOMY_VIEW_CONFIG,
  normalizeStoredAstronomyViewConfig,
  resolveAstronomyLocationId,
  shouldFallbackToWeatherDefault,
} from "../../../hooks/useAstronomyConfig";

describe("astronomy widget config defaults", () => {
  it("defaults to summary mode with no location override", () => {
    expect(DEFAULT_ASTRONOMY_VIEW_CONFIG).toEqual({
      locationId: null,
      viewMode: "summary",
    });
  });

  it("returns defaults for missing or malformed stored values", () => {
    expect(normalizeStoredAstronomyViewConfig(null)).toEqual(
      DEFAULT_ASTRONOMY_VIEW_CONFIG,
    );
    expect(normalizeStoredAstronomyViewConfig(undefined)).toEqual(
      DEFAULT_ASTRONOMY_VIEW_CONFIG,
    );
    expect(normalizeStoredAstronomyViewConfig("not-an-object")).toEqual(
      DEFAULT_ASTRONOMY_VIEW_CONFIG,
    );
    expect(normalizeStoredAstronomyViewConfig([1, 2])).toEqual(
      DEFAULT_ASTRONOMY_VIEW_CONFIG,
    );
  });

  it("applies valid stored values", () => {
    const config = normalizeStoredAstronomyViewConfig({
      locationId: "loc-1",
      viewMode: "detailed",
    });
    expect(config).toEqual({ locationId: "loc-1", viewMode: "detailed" });
  });

  it("ignores invalid stored values and unknown or obsolete fields", () => {
    const config = normalizeStoredAstronomyViewConfig({
      locationId: 42,
      viewMode: "planetarium",
      someFutureField: true,
    });
    expect(config).toEqual(DEFAULT_ASTRONOMY_VIEW_CONFIG);
    // Obsolete/unknown fields must never leak into active config output.
    expect(JSON.stringify(config)).not.toContain("someFutureField");
  });
});

const LOCATIONS = [{ id: "loc-1" }, { id: "loc-2" }];

describe("effective location resolution", () => {
  it("uses the configured location when it still exists", () => {
    expect(resolveAstronomyLocationId("loc-2", LOCATIONS, "loc-1")).toBe(
      "loc-2",
    );
  });

  it("falls back to the Weather default when the configured location was removed", () => {
    expect(resolveAstronomyLocationId("removed", LOCATIONS, "loc-1")).toBe(
      "loc-1",
    );
  });

  it("returns null when neither configured nor default locations exist", () => {
    expect(resolveAstronomyLocationId("removed", LOCATIONS, "also-gone")).toBe(
      null,
    );
    expect(resolveAstronomyLocationId("removed", [], "loc-1")).toBe(null);
    expect(resolveAstronomyLocationId(null, LOCATIONS, null)).toBe(null);
  });

  it("follows the Weather default dynamically when unconfigured", () => {
    expect(resolveAstronomyLocationId(null, LOCATIONS, "loc-2")).toBe("loc-2");
  });
});

describe("removed-location fallback persistence decision", () => {
  it("requests persistence only for a removed configured location with a valid default", () => {
    expect(shouldFallbackToWeatherDefault("removed", LOCATIONS, "loc-1")).toBe(
      true,
    );
  });

  it("does nothing when configuration is valid, unset, or defaultless", () => {
    expect(shouldFallbackToWeatherDefault("loc-1", LOCATIONS, "loc-2")).toBe(
      false,
    );
    expect(shouldFallbackToWeatherDefault(null, LOCATIONS, "loc-2")).toBe(
      false,
    );
    expect(shouldFallbackToWeatherDefault("removed", LOCATIONS, null)).toBe(
      false,
    );
    expect(shouldFallbackToWeatherDefault("removed", LOCATIONS, "gone")).toBe(
      false,
    );
  });
});
