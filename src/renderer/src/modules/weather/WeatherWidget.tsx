import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  RefreshCcw,
  RotateCcw,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { useAstronomyEnabled } from "../../contexts/AstronomyEnabledContext";
import {
  useWeatherConfig,
  DEFAULT_WEATHER_VIEW_CONFIG,
} from "../../hooks/useWeatherConfig";
import { useWeatherLocations } from "../../hooks/useWeatherLocations";
import { useWeatherSettings } from "../../hooks/useWeatherSettings";
import { useWeatherSnapshot } from "../../hooks/useWeatherSnapshot";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { cn } from "../../lib/utils";
import { WeatherSettingsPanel } from "./WeatherSettingsPanel";
import { AstronomyStrip } from "./AstronomyStrip";
import { registerRendererModule } from "../registry";
import type {
  WeatherDailyPoint,
  WeatherHourlyPoint,
  WeatherSettings,
  WeatherSnapshot,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";
import { IPC, type IpcMutationResult } from "../../../../shared/ipc-types";

function weatherIcon(code: number | null, isDay: boolean): React.ReactElement {
  if (code == null) return <Cloud className="h-8 w-8 text-muted-foreground" />;
  if (code === 0)
    return isDay ? (
      <Sun className="h-8 w-8 text-amber-500" />
    ) : (
      <Moon className="h-8 w-8 text-sky-400" />
    );
  if (code === 1 || code === 2)
    return isDay ? (
      <CloudSun className="h-8 w-8 text-amber-500" />
    ) : (
      <CloudMoon className="h-8 w-8 text-sky-400" />
    );
  if (code === 3) return <Cloud className="h-8 w-8 text-slate-500" />;
  if (code === 45 || code === 48)
    return <CloudFog className="h-8 w-8 text-slate-500" />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return code <= 55 ? (
      <CloudDrizzle className="h-8 w-8 text-sky-500" />
    ) : (
      <CloudRain className="h-8 w-8 text-sky-600" />
    );
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow className="h-8 w-8 text-sky-500" />;
  if (code >= 95) return <CloudLightning className="h-8 w-8 text-violet-500" />;
  return <Cloud className="h-8 w-8 text-muted-foreground" />;
}

function formatLocationName(snapshot: WeatherSnapshot | null): string {
  if (!snapshot) return "Location needed";
  return [
    snapshot.location.name,
    snapshot.location.admin1,
    snapshot.location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function tempUnit(settings: WeatherSettings): string {
  return settings.temperatureUnit === "fahrenheit" ? "F" : "C";
}

function windUnit(settings: WeatherSettings): string {
  if (settings.windSpeedUnit === "mph") return "mph";
  if (settings.windSpeedUnit === "ms") return "m/s";
  return "km/h";
}

function precipUnit(settings: WeatherSettings): string {
  return settings.precipitationUnit === "inch" ? "in" : "mm";
}

function formatTemp(value: number | null, settings: WeatherSettings): string {
  return value == null ? "-" : `${Math.round(value)}°${tempUnit(settings)}`;
}

function formatNumber(value: number | null, suffix: string): string {
  return value == null ? "-" : `${Math.round(value)} ${suffix}`;
}

function formatCompactNumber(value: number | null, suffix = ""): string {
  return value == null ? "-" : `${Math.round(value)}${suffix}`;
}

function formatVisibility(value: number | null): string {
  if (value == null) return "-";
  const km = value / 1000;
  return `${km >= 10 ? Math.round(km) : km.toFixed(1)} km`;
}

function formatAqi(value: number | null): string {
  return value == null ? "-" : String(Math.round(value));
}

function formatHourLabel(value: number, settings: WeatherSettings): string {
  const hour12 =
    settings.timeFormat === "system"
      ? undefined
      : settings.timeFormat === "12h";
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: "numeric",
    hour12,
  });
}

function formatLastSynced(
  timestamp: number | null,
  settings: WeatherSettings,
): string {
  if (timestamp == null) return "Never";
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const hour12 =
    settings.timeFormat === "system"
      ? undefined
      : settings.timeFormat === "12h";
  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12,
  });
  if (date.toDateString() === today.toDateString())
    return `Today at ${timeLabel}`;
  if (date.toDateString() === yesterday.toDateString())
    return `Yesterday at ${timeLabel}`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12,
  });
}

function hourlyCount(config: WeatherViewConfig): number {
  if (config.detailLevel === "summary") return 6;
  if (config.detailLevel === "detailed") return 24;
  return 12;
}

function dailyCount(config: WeatherViewConfig): number {
  if (config.detailLevel === "summary") return 3;
  if (config.detailLevel === "detailed") return 7;
  return 5;
}

function CurrentDetailGrid({
  snapshot,
  config,
  settings,
}: {
  snapshot: WeatherSnapshot;
  config: WeatherViewConfig;
  settings: WeatherSettings;
}): React.ReactElement {
  const current = snapshot.current;
  if (!current) return <></>;

  const details: Array<{
    key: string;
    label: string;
    value: string;
    visible: boolean;
  }> = [
    {
      key: "aqi",
      label: "Air quality",
      value: formatAqi(snapshot.airQuality),
      visible: config.showAirQuality,
    },
    {
      key: "precip",
      label: "Precip",
      value: formatNumber(current.precipitation, precipUnit(settings)),
      visible: config.showPrecipitation,
    },
    {
      key: "wind",
      label: "Wind",
      value: formatNumber(current.windSpeed, windUnit(settings)),
      visible: config.showWind,
    },
    {
      key: "humidity",
      label: "Humidity",
      value: formatCompactNumber(current.relativeHumidity, "%"),
      visible: config.showHumidity,
    },
    {
      key: "feels",
      label: "Feels like",
      value: formatTemp(current.apparentTemperature, settings),
      visible: config.showFeelsLike,
    },
    {
      key: "visibility",
      label: "Visibility",
      value: formatVisibility(current.visibility),
      visible: config.showVisibility && config.detailLevel !== "summary",
    },
    {
      key: "uv",
      label: "UV index",
      value: formatCompactNumber(current.uvIndex),
      visible: config.showUvIndex && config.detailLevel !== "summary",
    },
    {
      key: "pressure",
      label: "Pressure",
      value: formatNumber(current.surfacePressure, "hPa"),
      visible: config.showPressure && config.detailLevel !== "summary",
    },
    {
      key: "dew",
      label: "Dew point",
      value: formatTemp(current.dewPoint, settings),
      visible: config.showDewPoint && config.detailLevel !== "summary",
    },
  ].filter((detail) => detail.visible);

  if (details.length === 0) return <></>;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
      {details.map((detail) => (
        <div key={detail.key} className="min-w-0">
          <p className="truncate text-[10px] font-medium text-muted-foreground">
            {detail.label}
          </p>
          <p className="truncate text-xs font-semibold leading-tight">
            {detail.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function TemperatureAreaChart({
  points,
  settings,
  gradientId,
}: {
  points: WeatherHourlyPoint[];
  settings: WeatherSettings;
  gradientId: string;
}): React.ReactElement {
  if (points.length === 0) return <></>;

  const width = Math.max(points.length * 58, 340);
  const height = 94;
  const chartTop = 10;
  const chartBottom = 88;
  const chartLeft = 18;
  const chartRight = width - 8;
  const temps = points.map((point) => point.temperature ?? 0);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const tempRange = maxTemp - minTemp || 1;
  const step =
    points.length > 1 ? (chartRight - chartLeft) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const temp = point.temperature ?? minTemp;
    const x = chartLeft + step * index;
    const y =
      chartBottom - ((temp - minTemp) / tempRange) * (chartBottom - chartTop);
    return { x, y };
  });
  const linePath = coords
    .map(
      (coord, index) =>
        `${index === 0 ? "M" : "L"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${chartBottom} L ${coords[0].x.toFixed(2)} ${chartBottom} Z`;

  return (
    <svg
      className="block"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Hourly temperature trend"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="hsl(199 89% 55% / 0.36)" />
          <stop offset="52%" stopColor="hsl(38 92% 60% / 0.46)" />
          <stop offset="100%" stopColor="hsl(199 89% 55% / 0.30)" />
        </linearGradient>
      </defs>
      {[minTemp, (minTemp + maxTemp) / 2, maxTemp].map((temp) => {
        const y =
          chartBottom -
          ((temp - minTemp) / tempRange) * (chartBottom - chartTop);
        return (
          <g key={temp}>
            <line
              x1={chartLeft}
              x2={chartRight}
              y1={y}
              y2={y}
              stroke="hsl(var(--border) / 0.35)"
              strokeDasharray="2 3"
            />
            <text
              x={0}
              y={y + 3}
              fill="hsl(var(--muted-foreground))"
              fontSize="9"
            >
              {formatTemp(temp, settings)}
            </text>
          </g>
        );
      })}
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="hsl(38 92% 62% / 0.9)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function HourlyTimeline({
  points,
  config,
  settings,
  onMetricChange,
}: {
  points: WeatherHourlyPoint[];
  config: WeatherViewConfig;
  settings: WeatherSettings;
  onMetricChange: (metric: WeatherViewConfig["hourlyMetric"]) => void;
}): React.ReactElement {
  const gradientId = React.useId();
  const visible = points.slice(0, hourlyCount(config));

  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hourly forecast available.
      </p>
    );
  }

  const contentWidth = Math.max(visible.length * 58, 340);
  const layoutWidth = Math.min(contentWidth, 760);
  const gridStyle: React.CSSProperties = {
    width: contentWidth,
    gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
  };
  const tabs: Array<{ key: WeatherViewConfig["hourlyMetric"]; label: string }> =
    [
      { key: "overview", label: "Overview" },
      { key: "precipitation", label: "Precipitation" },
      { key: "wind", label: "Wind" },
      { key: "humidity", label: "Humidity" },
    ];

  return (
    <div className="w-fit max-w-full space-y-2 rounded-md border bg-muted/5 p-2.5">
      <div className="mr-auto w-full max-w-[760px] space-y-2">
        <div
          className="flex max-w-full items-center justify-between gap-2"
          style={{ width: layoutWidth }}
        >
          <h4 className="text-xs font-semibold">Hourly</h4>
          <div className="flex overflow-hidden rounded-md border text-[10px]">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={cn(
                  "px-2 py-1 transition-colors",
                  config.hourlyMetric === tab.key
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
                aria-pressed={config.hourlyMetric === tab.key}
                onClick={() => onMetricChange(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="weather-timeline-scroll overflow-x-auto">
          <div className="grid gap-0.5" style={gridStyle}>
            {visible.map((point, index) => (
              <div
                key={point.time}
                className="flex min-w-0 flex-col items-center gap-0.5 text-center"
              >
                <span className="text-[10px] leading-none text-muted-foreground">
                  {index === 0 ? "Now" : formatHourLabel(point.time, settings)}
                </span>
                <div className="[&_svg]:h-3.5 [&_svg]:w-3.5">
                  {weatherIcon(point.weatherCode, true)}
                </div>
                <span className="text-[10px] font-semibold leading-none">
                  {formatTemp(point.temperature, settings)}
                </span>
              </div>
            ))}
          </div>

          {config.hourlyMetric === "overview" ? (
            <>
              <TemperatureAreaChart
                points={visible}
                settings={settings}
                gradientId={gradientId}
              />
              {config.showPrecipitation && (
                <div className="mt-0.5 grid gap-0.5" style={gridStyle}>
                  {visible.map((point) => {
                    const rain = Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round(point.precipitationProbability ?? 0),
                      ),
                    );
                    return (
                      <div
                        key={`${point.time}:rain`}
                        className="relative h-4 overflow-hidden rounded-full bg-muted/30"
                        title={`${rain}% chance of precipitation`}
                      >
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-sky-500/40"
                          style={{ width: `${rain}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-medium leading-none text-muted-foreground">
                          {rain}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 grid gap-0.5" style={gridStyle}>
              {visible.map((point) => (
                <div
                  key={`${point.time}:${config.hourlyMetric}`}
                  className="rounded-md bg-muted/20 px-1.5 py-2 text-center"
                >
                  {config.hourlyMetric === "precipitation" && (
                    <>
                      <p className="text-[11px] font-semibold">
                        {formatNumber(
                          point.precipitation,
                          precipUnit(settings),
                        )}
                      </p>
                      <p className="text-[9px] text-sky-400">
                        {formatCompactNumber(
                          point.precipitationProbability,
                          "%",
                        )}
                      </p>
                    </>
                  )}
                  {config.hourlyMetric === "wind" && (
                    <p className="text-[11px] font-semibold">
                      {formatNumber(point.windSpeed, windUnit(settings))}
                    </p>
                  )}
                  {config.hourlyMetric === "humidity" && (
                    <p className="text-[11px] font-semibold">
                      {formatCompactNumber(point.relativeHumidity, "%")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyForecast({
  points,
  yesterday,
  config,
  settings,
}: {
  points: WeatherDailyPoint[];
  yesterday: WeatherDailyPoint | null;
  config: WeatherViewConfig;
  settings: WeatherSettings;
}): React.ReactElement {
  const visible = [
    ...(config.showYesterday && yesterday
      ? [{ point: yesterday, label: "Yesterday", muted: true, isToday: false }]
      : []),
    ...points.slice(0, dailyCount(config)).map((point, index) => ({
      point,
      label:
        index === 0
          ? "Today"
          : new Date(`${point.date}T12:00:00`).toLocaleDateString([], {
              weekday: "short",
            }),
      muted: false,
      isToday: index === 0,
    })),
  ];

  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No daily forecast available.
      </p>
    );
  }

  return (
    <div className="weather-timeline-scroll flex gap-2 overflow-x-auto pb-0.5">
      {visible.map(({ point, label, muted, isToday }) => (
        <div
          key={`${point.date}:${label}`}
          className={cn(
            "flex min-w-[92px] flex-col gap-2 rounded-md px-3 py-2",
            isToday
              ? "border border-primary/40 bg-primary/10 ring-1 ring-primary/20"
              : "bg-muted/20",
            muted && "opacity-70",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-[10px] font-semibold",
                isToday
                  ? "text-primary"
                  : muted
                    ? "text-muted-foreground"
                    : "text-foreground",
              )}
            >
              {label}
            </span>
            {config.detailLevel !== "summary" && config.showPrecipitation && (
              <span className="text-[9px] text-sky-400">
                {formatCompactNumber(point.precipitationProbabilityMax, "%")}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="[&_svg]:h-6 [&_svg]:w-6">
              {weatherIcon(point.weatherCode, true)}
            </div>
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">
                {formatTemp(point.tempMax, settings)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatTemp(point.tempMin, settings)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function WeatherWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance();
  const widgetTitle = label ?? "Weather";
  const { config, setConfig } = useWeatherConfig(instanceId);
  const { enabled: astronomyFeatureEnabled } = useAstronomyEnabled();
  const { locations, search, saveLocation } = useWeatherLocations();
  const { settings } = useWeatherSettings();
  const effectiveLocationId = config.locationId ?? settings.defaultLocationId;
  const { snapshot, loading } = useWeatherSnapshot(effectiveLocationId);
  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] =
    useState<WeatherViewConfig | null>(null);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastManualRefreshAt = useRef<number | null>(null);
  const cardContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAlertDismissed(false);
  }, [snapshot?.fetchedAt]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);

  const visibleAlerts = useMemo(() => {
    if (!snapshot) return [];
    if (!config.showAlerts || !settings.showAlertsInWidgets) return [];
    return snapshot.alerts;
  }, [config.showAlerts, settings.showAlertsInWidgets, snapshot]);

  const lastUpdatedLabel = useMemo(
    () => formatLastSynced(snapshot?.fetchedAt ?? null, settings),
    [snapshot?.fetchedAt, settings],
  );

  // App-level Astronomy gate combined with the instance-scoped choice.
  const astronomyVisible = astronomyFeatureEnabled && config.showAstronomy;

  const refreshNow = async (): Promise<void> => {
    const now = Date.now();
    if (
      lastManualRefreshAt.current != null &&
      now - lastManualRefreshAt.current < 60_000
    ) {
      const secsLeft = Math.ceil(
        (60_000 - (now - lastManualRefreshAt.current)) / 1000,
      );
      toast.warning(`Please wait ${secsLeft}s before refreshing again.`);
      return;
    }

    setRefreshing(true);
    lastManualRefreshAt.current = now;
    try {
      const result = (await window.api.invoke(
        IPC.WEATHER_REFRESH,
        effectiveLocationId,
      )) as IpcMutationResult;
      if (!result.ok) {
        toast.error(result.error ?? "Failed to refresh weather data.");
        return;
      }
      toast.success("Weather data refreshed.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to refresh weather data.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  function handleOpenEdit(): void {
    const currentHeight =
      cardContentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight);
    }
    setSnapshotConfig(config);
    setIsEditing(true);
  }

  function handleClose(): void {
    setIsEditing(false);
    setSnapshotConfig(null);
    setEditContentHeight(null);
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig);
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_WEATHER_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_WEATHER_VIEW_CONFIG);
  }

  const updateHourlyMetric = (
    hourlyMetric: WeatherViewConfig["hourlyMetric"],
  ): void => {
    setConfig({ ...config, hourlyMetric });
  };

  const hourlyContentWidth = Math.min(
    Math.max(
      (snapshot?.hourly.slice(0, hourlyCount(config)).length ?? 0) * 58,
      340,
    ),
    760,
  );

  const preview = (
    <div className="space-y-3">
      {!effectiveLocationId ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          Choose a location in widget settings, or set a default location in
          Settings - Weather.
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading weather...</p>
      ) : !snapshot?.current ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No weather data cached yet. Use Settings - Weather to refresh now, or
          wait for the next scheduled update.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
            <div className="flex items-start gap-2.5 sm:shrink-0">
              <div className="shrink-0 [&_svg]:h-9 [&_svg]:w-9">
                {weatherIcon(
                  snapshot.current.weatherCode,
                  snapshot.current.isDay,
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="text-3xl font-light">
                    {formatTemp(snapshot.current.temperature, settings)}
                  </span>
                  {config.showFeelsLike && (
                    <span className="text-xs text-muted-foreground">
                      feels{" "}
                      {formatTemp(
                        snapshot.current.apparentTemperature,
                        settings,
                      )}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatLocationName(snapshot)}
                </p>
                {snapshot.stale && (
                  <Badge variant="secondary" className="mt-1.5">
                    Stale
                  </Badge>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1 sm:max-w-[42rem]">
              <CurrentDetailGrid
                snapshot={snapshot}
                config={config}
                settings={settings}
              />
            </div>
          </div>

          {visibleAlerts.length > 0 && !alertDismissed && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-amber-600 dark:text-amber-400">
                    {visibleAlerts.map((alert) => alert.title).join(" · ")}
                  </p>
                  {config.detailLevel === "detailed" && (
                    <div className="mt-0.5 space-y-0.5">
                      {visibleAlerts.map((alert) => (
                        <p
                          key={`${alert.id}:msg`}
                          className="text-[10px] text-muted-foreground"
                        >
                          {alert.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Dismiss alert"
                onClick={() => setAlertDismissed(true)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {astronomyVisible && snapshot.location.timezone && (
            <AstronomyStrip
              astronomy={snapshot.astronomy}
              timezone={snapshot.location.timezone}
              settings={settings}
              contentWidth={hourlyContentWidth}
            />
          )}

          {config.displayMode !== "current" && (
            <>
              {config.displayMode === "current_all" ? (
                <div className="space-y-3">
                  <DailyForecast
                    points={snapshot.daily}
                    yesterday={snapshot.yesterday}
                    config={config}
                    settings={settings}
                  />
                  <HourlyTimeline
                    points={snapshot.hourly}
                    config={config}
                    settings={settings}
                    onMetricChange={updateHourlyMetric}
                  />
                </div>
              ) : config.displayMode === "current_hourly" ? (
                <HourlyTimeline
                  points={snapshot.hourly}
                  config={config}
                  settings={settings}
                  onMetricChange={updateHourlyMetric}
                />
              ) : (
                <DailyForecast
                  points={snapshot.daily}
                  yesterday={snapshot.yesterday}
                  config={config}
                  settings={settings}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CloudSun className="h-5 w-5 text-sky-500" />
              {widgetTitle}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Updated: {lastUpdatedLabel}
                </p>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={() => void refreshNow()}
                  disabled={refreshing}
                  aria-label="Refresh weather data"
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                  />
                </button>
              </>
            )}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleReset}
                  title="Reset to when you opened this"
                  aria-label="Reset settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Restore defaults"
                      aria-label="Restore default settings"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset all Weather widget settings to their defaults?
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFactoryReset}>
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleClose}
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Weather widget settings"
                onClick={handleOpenEdit}
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        style={
          isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : undefined
        }
      >
        <div className={isEditing ? "weather-card-edit" : undefined}>
          <div className={isEditing ? "weather-card-edit__preview" : undefined}>
            {preview}
          </div>
          {isEditing && (
            <div className="weather-card-edit__panel">
              <WeatherSettingsPanel
                config={config}
                onChange={setConfig}
                locations={locations}
                defaultLocationId={settings.defaultLocationId}
                settings={settings}
                onSearch={search}
                onSaveLocation={saveLocation}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

registerRendererModule({
  id: "weather",
  displayName: "Weather",
  widget: WeatherWidget,
});

export default WeatherWidget;
