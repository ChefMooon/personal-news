import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import type {
  WeatherSettings,
  WeatherSnapshot,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";
import type {
  WeatherAlertPresentation,
  WeatherContentPolicy,
} from "./weather-content-policy";

export interface WeatherLayoutProps {
  snapshot: WeatherSnapshot;
  config: WeatherViewConfig;
  settings: WeatherSettings;
  policy: WeatherContentPolicy;
  onMetricChange: (metric: WeatherViewConfig["hourlyMetric"]) => void;
}
export function weatherIcon(
  code: number | null,
  isDay: boolean,
  compact = false,
): React.ReactElement {
  const size = compact ? "h-5 w-5" : "h-8 w-8";
  if (code == null)
    return <Cloud className={`${size} text-muted-foreground`} />;
  if (code === 0)
    return isDay ? (
      <Sun className={`${size} text-amber-500`} />
    ) : (
      <Moon className={`${size} text-sky-400`} />
    );
  if (code === 1 || code === 2)
    return isDay ? (
      <CloudSun className={`${size} text-amber-500`} />
    ) : (
      <CloudMoon className={`${size} text-sky-400`} />
    );
  if (code === 3) return <Cloud className={`${size} text-slate-500`} />;
  if (code === 45 || code === 48)
    return <CloudFog className={`${size} text-slate-500`} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return code <= 55 ? (
      <CloudDrizzle className={`${size} text-sky-500`} />
    ) : (
      <CloudRain className={`${size} text-sky-600`} />
    );
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow className={`${size} text-sky-500`} />;
  if (code >= 95)
    return <CloudLightning className={`${size} text-violet-500`} />;
  return <Cloud className={`${size} text-muted-foreground`} />;
}
export function tempUnit(settings: WeatherSettings): string {
  return settings.temperatureUnit === "fahrenheit" ? "F" : "C";
}
export function windUnit(settings: WeatherSettings): string {
  return settings.windSpeedUnit === "mph"
    ? "mph"
    : settings.windSpeedUnit === "ms"
      ? "m/s"
      : "km/h";
}
export function precipUnit(settings: WeatherSettings): string {
  return settings.precipitationUnit === "inch" ? "in" : "mm";
}
export function formatTemp(
  value: number | null,
  settings: WeatherSettings,
): string {
  return value == null ? "-" : `${Math.round(value)}°${tempUnit(settings)}`;
}
export function formatNumber(value: number | null, suffix: string): string {
  return value == null ? "-" : `${Math.round(value)} ${suffix}`;
}
export function formatCompactNumber(value: number | null, suffix = ""): string {
  return value == null ? "-" : `${Math.round(value)}${suffix}`;
}
export function formatHourLabel(
  value: number,
  settings: WeatherSettings,
): string {
  const hour12 =
    settings.timeFormat === "system"
      ? undefined
      : settings.timeFormat === "12h";
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: "numeric",
    hour12,
  });
}
function locationName(snapshot: WeatherSnapshot): string {
  return [
    snapshot.location.name,
    snapshot.location.admin1,
    snapshot.location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function WeatherSummary({
  snapshot,
  config,
  settings,
  compact = false,
  trailing,
}: {
  snapshot: WeatherSnapshot;
  config: WeatherViewConfig;
  settings: WeatherSettings;
  compact?: boolean;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const current = snapshot.current;
  if (!current)
    return (
      <p className="text-xs text-muted-foreground">
        Current conditions unavailable.
      </p>
    );
  const details: Array<[string, string, boolean]> = [
    [
      "Air quality",
      snapshot.airQuality == null
        ? "-"
        : String(Math.round(snapshot.airQuality)),
      config.showAirQuality,
    ],
    [
      "Precip",
      formatNumber(current.precipitation, precipUnit(settings)),
      config.showPrecipitation,
    ],
    [
      "Wind",
      formatNumber(current.windSpeed, windUnit(settings)),
      config.showWind,
    ],
    [
      "Humidity",
      formatCompactNumber(current.relativeHumidity, "%"),
      config.showHumidity,
    ],
    [
      "Visibility",
      current.visibility == null
        ? "-"
        : `${(current.visibility / 1000).toFixed(1)} km`,
      config.showVisibility && config.detailLevel !== "summary",
    ],
    [
      "UV index",
      formatCompactNumber(current.uvIndex),
      config.showUvIndex && config.detailLevel !== "summary",
    ],
    [
      "Pressure",
      formatNumber(current.surfacePressure, "hPa"),
      config.showPressure && config.detailLevel !== "summary",
    ],
    [
      "Dew point",
      formatTemp(current.dewPoint, settings),
      config.showDewPoint && config.detailLevel !== "summary",
    ],
  ].filter((detail): detail is [string, string, boolean] => Boolean(detail[2]));
  return (
    <section
      className={cn(
        "min-w-0 rounded-md border bg-muted/5",
        compact ? "p-2" : "p-3",
      )}
      aria-label="Current weather"
    >
      <div
        className={cn(
          "grid min-w-0 gap-3",
          trailing
            ? "grid-cols-[minmax(9rem,1.1fr)_minmax(0,2fr)_auto]"
            : "grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
        )}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="shrink-0">
            {weatherIcon(current.weatherCode, current.isDay, compact)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-1.5 leading-none">
              <span
                className={
                  compact ? "text-2xl font-light" : "text-3xl font-light"
                }
              >
                {formatTemp(current.temperature, settings)}
              </span>
              {config.showFeelsLike && (
                <span className="text-xs text-muted-foreground">
                  feels {formatTemp(current.apparentTemperature, settings)}
                </span>
              )}
            </div>
            <p
              className={cn(
                "mt-1 break-words text-xs text-muted-foreground",
                trailing && "line-clamp-2",
              )}
            >
              {locationName(snapshot)}
            </p>
            {snapshot.stale && (
              <Badge variant="secondary" className="mt-1">
                Stale
              </Badge>
            )}
          </div>
        </div>
        {details.length > 0 && (
          <div
            className={cn(
              "grid min-w-0 self-center text-left",
              compact
                ? "grid-cols-4 gap-x-2 gap-y-1"
                : trailing
                  ? "grid-cols-4 gap-x-3 gap-y-2"
                  : "grid-cols-4 gap-x-3 gap-y-2 lg:grid-cols-5",
            )}
          >
            {details.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <p
                  className={cn(
                    "truncate font-medium text-muted-foreground",
                    compact ? "text-[9px]" : "text-[10px]",
                  )}
                >
                  {label}
                </p>
                <p
                  className={cn(
                    "truncate font-semibold leading-tight",
                    compact ? "text-[10px]" : "text-xs",
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
        {trailing && <div className="self-start">{trailing}</div>}
      </div>
    </section>
  );
}

export function WeatherInlineAlert({
  snapshot,
  visible,
  detail,
  presentation,
}: Pick<WeatherLayoutProps, "snapshot"> & {
  visible: boolean;
  detail: "summary" | "detailed";
  presentation: WeatherAlertPresentation;
}): React.ReactElement | null {
  const title = snapshot.alerts.map((alert) => alert.title).join(" · ");
  const showTitle = presentation !== "icon";
  const showDetails = presentation === "detailed" && detail === "detailed";
  const [popoverOpen, setPopoverOpen] = useState(false);
  const alertRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!popoverOpen) return;
    const handlePointerDown = (event: PointerEvent): void => {
      if (!alertRef.current?.contains(event.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setPopoverOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);
  if (!visible || snapshot.alerts.length === 0) return null;
  if (presentation === "icon") {
    return (
      <div ref={alertRef} className="relative self-start">
        <button
          type="button"
          className="rounded-md border border-amber-500/20 bg-amber-500/10 p-1.5 text-amber-500 hover:bg-amber-500/20"
          aria-label="Show weather alert"
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          onClick={() => setPopoverOpen((open) => !open)}
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
        {popoverOpen && (
          <div
            className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-amber-500/20 bg-popover p-3 text-popover-foreground shadow-lg"
            role="dialog"
            aria-label="Weather alerts"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{title}</p>
                {snapshot.alerts.map((alert) => (
                  <p
                    key={alert.id}
                    className="mt-1 break-words text-[10px] text-muted-foreground"
                  >
                    {alert.message}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex min-w-0 items-start rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        "max-w-[min(100%,20rem)] gap-1.5 px-2 py-1.5",
      )}
      role="alert"
      aria-label={title}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      {showTitle && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium">{title}</p>
          {showDetails &&
            snapshot.alerts.map((alert) => (
              <p
                key={alert.id}
                className="break-words text-[9px] text-muted-foreground"
              >
                {alert.message}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
