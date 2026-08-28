import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEATHER_VIEW_CONFIG,
  normalizeStoredWeatherViewConfig,
} from "../../../hooks/useWeatherConfig";

describe("stored Weather widget config normalization", () => {
  it("defaults a missing showAstronomy field to enabled", () => {
    const config = normalizeStoredWeatherViewConfig({
      locationId: "loc-1",
      detailLevel: "detailed",
    });
    expect(config.showAstronomy).toBe(true);
    expect(DEFAULT_WEATHER_VIEW_CONFIG.showAstronomy).toBe(true);
    expect(config.showYesterday).toBe(true);
    expect(DEFAULT_WEATHER_VIEW_CONFIG.showYesterday).toBe(true);
  });

  it("preserves an explicit showAstronomy choice", () => {
    expect(
      normalizeStoredWeatherViewConfig({ showAstronomy: false }).showAstronomy,
    ).toBe(false);
    expect(
      normalizeStoredWeatherViewConfig({ showAstronomy: true }).showAstronomy,
    ).toBe(true);
  });

  it("tolerates legacy forecastView and showSunTimes without restoring them", () => {
    const stored = {
      locationId: "loc-2",
      displayMode: "current_hourly",
      forecastView: "hourly",
      showSunTimes: true,
      showWind: false,
    };
    const config = normalizeStoredWeatherViewConfig(stored);

    expect(config).not.toHaveProperty("forecastView");
    expect(config).not.toHaveProperty("showSunTimes");
    expect(config.displayMode).toBe("current_hourly");
    expect(config.showWind).toBe(false);
    // The removed sun-time row must not come back through legacy state.
    expect(JSON.stringify(config)).not.toContain("forecastView");
    expect(JSON.stringify(config)).not.toContain("showSunTimes");
  });

  it("migrates the legacy current_both display mode to current_all", () => {
    expect(
      normalizeStoredWeatherViewConfig({ displayMode: "current_both" })
        .displayMode,
    ).toBe("current_all");
  });

  it("falls back to defaults for malformed or unknown input", () => {
    expect(normalizeStoredWeatherViewConfig(null)).toEqual(
      DEFAULT_WEATHER_VIEW_CONFIG,
    );
    expect(normalizeStoredWeatherViewConfig(undefined)).toEqual(
      DEFAULT_WEATHER_VIEW_CONFIG,
    );
    expect(normalizeStoredWeatherViewConfig("garbage")).toEqual(
      DEFAULT_WEATHER_VIEW_CONFIG,
    );
    expect(normalizeStoredWeatherViewConfig(42)).toEqual(
      DEFAULT_WEATHER_VIEW_CONFIG,
    );
    expect(normalizeStoredWeatherViewConfig(["nope"])).toEqual(
      DEFAULT_WEATHER_VIEW_CONFIG,
    );
  });

  it("ignores invalid enum values while preserving valid unrelated settings", () => {
    const config = normalizeStoredWeatherViewConfig({
      displayMode: "hologram",
      detailLevel: "maximum",
      hourlyMetric: "rainbows",
      locationId: "",
      showAlerts: false,
      showHumidity: true,
    });
    expect(config.displayMode).toBe(DEFAULT_WEATHER_VIEW_CONFIG.displayMode);
    expect(config.detailLevel).toBe(DEFAULT_WEATHER_VIEW_CONFIG.detailLevel);
    expect(config.hourlyMetric).toBe(DEFAULT_WEATHER_VIEW_CONFIG.hourlyMetric);
    expect(config.locationId).toBeNull();
    expect(config.showAlerts).toBe(false);
    expect(config.showHumidity).toBe(true);
  });

  it("keeps a valid non-empty locationId", () => {
    expect(
      normalizeStoredWeatherViewConfig({ locationId: "abc" }).locationId,
    ).toBe("abc");
  });
});
