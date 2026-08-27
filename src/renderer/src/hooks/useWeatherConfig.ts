import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { WeatherViewConfig } from "../../../shared/ipc-types";

export const DEFAULT_WEATHER_VIEW_CONFIG: WeatherViewConfig = {
  locationId: null,
  detailLevel: "standard",
  displayMode: "current_hourly",
  hourlyMetric: "overview",
  showAlerts: true,
  showAstronomy: true,
  showPrecipitation: true,
  showWind: true,
  showHumidity: false,
  showFeelsLike: true,
  showYesterday: false,
  showAirQuality: true,
  showVisibility: true,
  showUvIndex: true,
  showPressure: true,
  showDewPoint: true,
};

const DISPLAY_MODES = [
  "current",
  "current_all",
  "current_hourly",
  "current_daily",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a stored Weather widget config into the active contract.
 * Legacy persisted fields (`forecastView`, `showSunTimes`) are tolerated on
 * read but never restored into active behavior. Missing `showAstronomy`
 * defaults to enabled.
 */
export function normalizeStoredWeatherViewConfig(
  raw: unknown,
): WeatherViewConfig {
  const config: WeatherViewConfig = { ...DEFAULT_WEATHER_VIEW_CONFIG };
  if (!isRecord(raw)) {
    return config;
  }

  const stored: Record<string, unknown> = raw;

  const rawDisplayMode = stored.displayMode;
  // Legacy combined mode migrates to current_all.
  if (rawDisplayMode === "current_both") {
    config.displayMode = "current_all";
  } else if (
    typeof rawDisplayMode === "string" &&
    (DISPLAY_MODES as readonly string[]).includes(rawDisplayMode)
  ) {
    config.displayMode = rawDisplayMode as WeatherViewConfig["displayMode"];
  }

  const rawLocationId = stored.locationId;
  if (
    rawLocationId === null ||
    (typeof rawLocationId === "string" && rawLocationId.length > 0)
  ) {
    config.locationId = rawLocationId;
  }

  const rawDetailLevel = stored.detailLevel;
  if (
    rawDetailLevel === "summary" ||
    rawDetailLevel === "standard" ||
    rawDetailLevel === "detailed"
  ) {
    config.detailLevel = rawDetailLevel;
  }

  const rawHourlyMetric = stored.hourlyMetric;
  if (
    rawHourlyMetric === "overview" ||
    rawHourlyMetric === "precipitation" ||
    rawHourlyMetric === "wind" ||
    rawHourlyMetric === "humidity"
  ) {
    config.hourlyMetric = rawHourlyMetric;
  }

  const booleanFields = [
    "showAlerts",
    "showAstronomy",
    "showPrecipitation",
    "showWind",
    "showHumidity",
    "showFeelsLike",
    "showYesterday",
    "showAirQuality",
    "showVisibility",
    "showUvIndex",
    "showPressure",
    "showDewPoint",
  ] as const;
  for (const field of booleanFields) {
    const value = stored[field];
    if (typeof value === "boolean") {
      config[field] = value;
    }
  }

  // Obsolete fields (forecastView, showSunTimes) are deliberately dropped so
  // legacy stored objects can never restore the removed controls.
  return config;
}

export function useWeatherConfig(instanceId: string): {
  config: WeatherViewConfig;
  setConfig: (newConfig: WeatherViewConfig) => void;
} {
  const [config, setConfigState] = useState<WeatherViewConfig>(
    DEFAULT_WEATHER_VIEW_CONFIG,
  );
  const storageKey = `weather_view_config:${instanceId}`;

  useEffect(() => {
    window.api
      .invoke("settings:get", storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState(
              normalizeStoredWeatherViewConfig(JSON.parse(raw as string)),
            );
          } catch {
            // Use default on parse error
          }
        }
      })
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load Weather widget settings.",
        );
      });
  }, [instanceId, storageKey]);

  const setConfig = (newConfig: WeatherViewConfig): void => {
    setConfigState(newConfig);
    window.api
      .invoke("settings:set", storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to save Weather widget settings.",
        );
      });
  };

  return { config, setConfig };
}
