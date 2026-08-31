import React from "react";
import type {
  WeatherHourlyPoint,
  WeatherSettings,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import {
  formatCompactNumber,
  formatHourLabel,
  formatNumber,
  formatTemp,
  precipUnit,
  weatherIcon,
  windUnit,
} from "./WeatherSummary";
import {
  clampRainProbability,
  formatRainProbability,
  hourlyChartCoordinates,
  type HourlyChartCoordinate,
  type HourlyChartMetric,
} from "./weather-hourly-chart";

function chartColor(metric: HourlyChartMetric): {
  line: string;
  start: string;
  middle: string;
  end: string;
} {
  switch (metric) {
    case "precipitation":
      return {
        line: "hsl(199 89% 55% / 0.9)",
        start: "hsl(199 89% 55% / 0.26)",
        middle: "hsl(190 85% 58% / 0.42)",
        end: "hsl(210 90% 60% / 0.24)",
      };
    case "wind":
      return {
        line: "hsl(158 64% 42% / 0.9)",
        start: "hsl(158 64% 42% / 0.24)",
        middle: "hsl(174 68% 45% / 0.4)",
        end: "hsl(164 68% 48% / 0.22)",
      };
    case "humidity":
      return {
        line: "hsl(245 70% 62% / 0.9)",
        start: "hsl(245 70% 62% / 0.24)",
        middle: "hsl(225 75% 64% / 0.4)",
        end: "hsl(260 68% 66% / 0.22)",
      };
    default:
      return {
        line: "hsl(38 92% 62% / 0.9)",
        start: "hsl(199 89% 55% / 0.28)",
        middle: "hsl(38 92% 60% / 0.46)",
        end: "hsl(215 90% 60% / 0.24)",
      };
  }
}

function chartMetricLabel(metric: HourlyChartMetric): string {
  return metric === "overview"
    ? "temperature"
    : metric === "precipitation"
      ? "precipitation"
      : metric === "wind"
        ? "wind"
        : "humidity";
}

function formatChartValue(
  value: number | null,
  metric: HourlyChartMetric,
  settings: WeatherSettings,
): string {
  return metric === "overview"
    ? formatTemp(value, settings)
    : metric === "precipitation"
      ? formatNumber(value, precipUnit(settings))
      : metric === "wind"
        ? formatNumber(value, windUnit(settings))
        : formatCompactNumber(value, "%");
}

function RainProbabilityPill({
  probability,
}: {
  probability: number | null;
}): React.ReactElement {
  const clamped = clampRainProbability(probability);
  const label =
    clamped == null
      ? "Chance of rain unavailable"
      : `Chance of rain ${Math.round(clamped)} percent`;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped ?? undefined}
      aria-label={label}
      className="relative w-full overflow-hidden rounded-md bg-muted/20 px-1.5 py-1 text-center text-[11px] font-semibold"
    >
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 bg-sky-500/50"
        style={{ width: `${clamped ?? 0}%` }}
      />
      <span className="relative">{formatRainProbability(probability)}</span>
    </div>
  );
}

function TemperatureAreaChart({
  points,
  metric,
  settings,
  gradientId,
  height,
}: {
  points: WeatherHourlyPoint[];
  metric: HourlyChartMetric;
  settings: WeatherSettings;
  gradientId: string;
  height: number;
}): React.ReactElement {
  const width = Math.max(points.length * 58, 340);
  const chartTop = 7;
  const chartBottom = height - 3;
  const chartLeft = 18;
  const chartRight = width - 8;
  const chart = hourlyChartCoordinates(points, metric, height);
  const colors = chartColor(metric);
  const coordinates = chart.coordinates.map((coordinate) =>
    coordinate
      ? {
          x: chartLeft + coordinate.x * (chartRight - chartLeft),
          y: coordinate.y,
        }
      : null,
  );
  const segments: HourlyChartCoordinate[][] = [];
  let currentSegment: HourlyChartCoordinate[] = [];
  coordinates.forEach((coordinate) => {
    if (!coordinate) {
      currentSegment = [];
      return;
    }
    if (!currentSegment.length) {
      currentSegment = [coordinate];
      segments.push(currentSegment);
    } else {
      currentSegment.push(coordinate);
    }
  });
  const linePaths = segments.map((segment) =>
    segment
      .map(
        (coordinate, index) =>
          `${index === 0 ? "M" : "L"} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`,
      )
      .join(" "),
  );
  const areaPaths = segments.map(
    (segment, index) =>
      `${linePaths[index]} L ${segment[segment.length - 1].x.toFixed(2)} ${chartBottom} L ${segment[0].x.toFixed(2)} ${chartBottom} Z`,
  );

  return (
    <svg
      className="block"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Hourly ${chartMetricLabel(metric)} trend`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={colors.start} />
          <stop offset="52%" stopColor={colors.middle} />
          <stop offset="100%" stopColor={colors.end} />
        </linearGradient>
      </defs>
      {[
        chart.min,
        chart.min != null && chart.max != null
          ? (chart.min + chart.max) / 2
          : null,
        chart.max,
      ].map((value, index) => {
        const y =
          chartBottom -
          ((value != null && chart.min != null ? value - chart.min : 0) /
            (chart.min != null && chart.max != null
              ? chart.max - chart.min || 1
              : 1)) *
            (chartBottom - chartTop);
        return (
          <g key={index}>
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
              {formatChartValue(value, metric, settings)}
            </text>
          </g>
        );
      })}
      {areaPaths.map((path, index) => (
        <path key={`area-${index}`} d={path} fill={`url(#${gradientId})`} />
      ))}
      {linePaths.map((path, index) => (
        <path
          key={`line-${index}`}
          d={path}
          fill="none"
          stroke={colors.line}
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

export function WeatherHourly({
  points,
  config,
  settings,
  cap,
  presentation = "standard",
  chartHeight = 85,
  onMetricChange,
}: {
  points: WeatherHourlyPoint[];
  config: WeatherViewConfig;
  settings: WeatherSettings;
  cap: number;
  presentation?: "compact" | "standard" | "tabbed";
  chartHeight?: number;
  onMetricChange: (metric: WeatherViewConfig["hourlyMetric"]) => void;
}): React.ReactElement {
  const gradientId = React.useId();
  const visible = points.slice(0, cap);
  if (!visible.length)
    return (
      <p className="text-xs text-muted-foreground">
        No hourly forecast available.
      </p>
    );
  const tabs: Array<[WeatherViewConfig["hourlyMetric"], string]> = [
    ["overview", "Overview"],
    ["precipitation", "Precipitation"],
    ["wind", "Wind"],
    ["humidity", "Humidity"],
  ];
  const minWidth = Math.max(
    visible.length * (presentation === "compact" ? 48 : 58),
    presentation === "compact" ? 288 : 340,
  );
  const metricValue = (point: WeatherHourlyPoint): string =>
    config.hourlyMetric === "overview"
      ? formatTemp(point.temperature, settings)
      : config.hourlyMetric === "precipitation"
        ? formatNumber(point.precipitation, precipUnit(settings))
        : config.hourlyMetric === "wind"
          ? formatNumber(point.windSpeed, windUnit(settings))
          : formatCompactNumber(point.relativeHumidity, "%");
  return (
    <section
      className="min-w-0 rounded-md border bg-muted/5 p-2.5"
      aria-label="Hourly forecast"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">Hourly</h3>
        {presentation === "tabbed" && (
          <div className="flex max-w-full flex-wrap overflow-hidden rounded-md border text-[10px]">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "px-2 py-1",
                  config.hourlyMetric === key
                    ? "bg-accent font-medium"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
                aria-pressed={config.hourlyMetric === key}
                onClick={() => onMetricChange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="weather-timeline-scroll mt-2 min-w-0 overflow-x-auto">
        <div
          className="grid gap-0.5"
          style={{
            minWidth: presentation === "compact" ? 0 : minWidth,
            gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
          }}
        >
          {visible.map((point, index) => (
            <div
              key={point.time}
              aria-current={index === 0 ? "time" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-0.5 rounded-md px-1 py-1 text-center",
                index === 0
                  ? "border border-primary/40 bg-primary/10"
                  : "bg-transparent",
              )}
            >
              <span className="text-[10px] leading-none text-muted-foreground">
                {index === 0 ? "Now" : formatHourLabel(point.time, settings)}
              </span>
              {weatherIcon(point.weatherCode, true, true)}
              <span className="text-[10px] font-semibold leading-none">
                {formatTemp(point.temperature, settings)}
              </span>
              {presentation === "compact" &&
                config.hourlyMetric !== "overview" && (
                  <span className="text-[9px] leading-none text-muted-foreground">
                    {metricValue(point)}
                  </span>
                )}
            </div>
          ))}
        </div>
        {presentation !== "compact" && (
          <TemperatureAreaChart
            points={visible}
            metric={config.hourlyMetric}
            settings={settings}
            gradientId={`weather-hourly-${gradientId}`}
            height={chartHeight}
          />
        )}
        {presentation !== "compact" && (
          <div
            className="mt-1 grid gap-0.5"
            style={{
              minWidth,
              gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((point) => (
              config.hourlyMetric === "overview" ? (
                <RainProbabilityPill
                  key={point.time}
                  probability={point.precipitationProbability}
                />
              ) : (
                <div
                  key={`${point.time}:${config.hourlyMetric}`}
                  className="rounded-md bg-muted/20 px-1.5 py-1 text-center text-[11px] font-semibold"
                >
                  {metricValue(point)}
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
