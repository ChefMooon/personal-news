import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { WeatherLocation } from "../../../shared/ipc-types";

export type AstronomyViewMode = "summary" | "detailed";

export interface AstronomyViewConfig {
  locationId: string | null;
  viewMode: AstronomyViewMode;
}

export const DEFAULT_ASTRONOMY_VIEW_CONFIG: AstronomyViewConfig = {
  locationId: null,
  viewMode: "summary",
};

const VIEW_MODES = ["summary", "detailed"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a stored Astronomy widget config into the active contract. Unknown or
 * obsolete fields are tolerated on read but never restored into active
 * behavior.
 */
export function normalizeStoredAstronomyViewConfig(
  raw: unknown,
): AstronomyViewConfig {
  const config: AstronomyViewConfig = { ...DEFAULT_ASTRONOMY_VIEW_CONFIG };
  if (!isRecord(raw)) {
    return config;
  }

  const stored: Record<string, unknown> = raw;

  const rawLocationId = stored.locationId;
  if (
    rawLocationId === null ||
    (typeof rawLocationId === "string" && rawLocationId.length > 0)
  ) {
    config.locationId = rawLocationId;
  }

  const rawViewMode = stored.viewMode;
  if (
    typeof rawViewMode === "string" &&
    (VIEW_MODES as readonly string[]).includes(rawViewMode)
  ) {
    config.viewMode = rawViewMode as AstronomyViewMode;
  }

  return config;
}

/**
 * Effective location for an instance: the configured saved Weather location
 * when it still exists, otherwise the Weather default location when valid,
 * otherwise null. Never consults a second location store.
 */
export function resolveAstronomyLocationId(
  configLocationId: string | null,
  locations: Array<Pick<WeatherLocation, "id">>,
  weatherDefaultLocationId: string | null,
): string | null {
  const exists = (id: string | null): boolean =>
    id != null && locations.some((location) => location.id === id);

  if (exists(configLocationId)) {
    return configLocationId;
  }
  if (exists(weatherDefaultLocationId)) {
    return weatherDefaultLocationId;
  }
  return null;
}

/**
 * True when the configured instance location no longer exists among the saved
 * Weather locations and a valid Weather default can replace it.
 */
export function shouldFallbackToWeatherDefault(
  configLocationId: string | null,
  locations: Array<Pick<WeatherLocation, "id">>,
  weatherDefaultLocationId: string | null,
): boolean {
  if (configLocationId == null) {
    return false;
  }
  if (locations.some((location) => location.id === configLocationId)) {
    return false;
  }
  return (
    resolveAstronomyLocationId(
      configLocationId,
      locations,
      weatherDefaultLocationId,
    ) != null
  );
}

export function useAstronomyConfig(instanceId: string): {
  config: AstronomyViewConfig;
  setConfig: (newConfig: AstronomyViewConfig) => void;
} {
  const [config, setConfigState] = useState<AstronomyViewConfig>(
    DEFAULT_ASTRONOMY_VIEW_CONFIG,
  );
  const storageKey = `astronomy_view_config:${instanceId}`;

  useEffect(() => {
    window.api
      .invoke("settings:get", storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState(
              normalizeStoredAstronomyViewConfig(JSON.parse(raw as string)),
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
            : "Failed to load Astronomy widget settings.",
        );
      });
  }, [instanceId, storageKey]);

  const setConfig = (newConfig: AstronomyViewConfig): void => {
    setConfigState(newConfig);
    window.api
      .invoke("settings:set", storageKey, JSON.stringify(newConfig))
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to save Astronomy widget settings.",
        );
      });
  };

  return { config, setConfig };
}
