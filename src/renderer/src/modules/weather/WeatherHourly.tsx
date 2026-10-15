import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
  hourlyTemperatureTrendColors,
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
  width,
}: {
  points: WeatherHourlyPoint[];
  metric: HourlyChartMetric;
  settings: WeatherSettings;
  gradientId: string;
  height: number;
  width: number;
}): React.ReactElement {
  const chartTop = 7;
  const chartBottom = height - 3;
  const chartLeft = width / (points.length * 2);
  const chartRight = width - chartLeft;
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
  const segments: Array<{
    coordinates: HourlyChartCoordinate[];
    startIndex: number;
  }> = [];
  let currentSegment: HourlyChartCoordinate[] = [];
  coordinates.forEach((coordinate, index) => {
    if (!coordinate) {
      currentSegment = [];
      return;
    }
    if (!currentSegment.length) {
      currentSegment = [coordinate];
      segments.push({ coordinates: currentSegment, startIndex: index });
    } else {
      currentSegment.push(coordinate);
    }
  });
  const linePaths = segments.map(({ coordinates: segment }) =>
    segment
      .map(
        (coordinate, index) =>
          `${index === 0 ? "M" : "L"} ${coordinate.x.toFixed(2)} ${coordinate.y.toFixed(2)}`,
      )
      .join(" "),
  );
  const areaPaths = segments.map(
    ({ coordinates: segment }, index) =>
      `${linePaths[index]} L ${segment[segment.length - 1].x.toFixed(2)} ${chartBottom} L ${segment[0].x.toFixed(2)} ${chartBottom} Z`,
  );
  const temperatureTrendColors =
    metric === "overview" ? hourlyTemperatureTrendColors(points) : [];
  const trendStops = segments.flatMap(({ coordinates: segment, startIndex }) =>
    segment.slice(0, -1).map((coordinate, index) => ({
      offset: ((coordinate.x + segment[index + 1].x) / 2 / width) * 100,
      color: temperatureTrendColors[startIndex + index],
    })),
  );
  const overviewGradientStops = [
    { offset: 0, color: temperatureTrendColors[0] },
    ...trendStops,
    {
      offset: 100,
      color: temperatureTrendColors[temperatureTrendColors.length - 1],
    },
  ];

  return (
    <svg
      className="absolute inset-0 block"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Hourly ${chartMetricLabel(metric)} trend`}
    >
      {metric !== "overview" ? (
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="52%" stopColor={colors.middle} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>
      ) : (
        <defs>
          <linearGradient
            id={`${gradientId}-line`}
            gradientUnits="userSpaceOnUse"
            x1={chartLeft}
            x2={chartRight}
            y1="0"
            y2="0"
          >
            {overviewGradientStops.map(({ offset, color }, index) => (
              <stop
                key={`line-stop-${index}`}
                offset={`${offset}%`}
                stopColor={color?.line ?? colors.line}
              />
            ))}
          </linearGradient>
          <linearGradient
            id={`${gradientId}-fill`}
            gradientUnits="userSpaceOnUse"
            x1={chartLeft}
            x2={chartRight}
            y1="0"
            y2="0"
          >
            {overviewGradientStops.map(({ offset, color }, index) => (
              <stop
                key={`fill-stop-${index}`}
                offset={`${offset}%`}
                stopColor={color?.fill ?? colors.middle}
              />
            ))}
          </linearGradient>
        </defs>
      )}
      {(height < 48
        ? [chart.min, chart.max]
        : [
            chart.min,
            chart.min != null && chart.max != null
              ? (chart.min + chart.max) / 2
              : null,
            chart.max,
          ]
      ).map((value, index) => {
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
              fontSize="11"
            >
              {formatChartValue(value, metric, settings)}
            </text>
          </g>
        );
      })}
      {areaPaths.map((path, index) => (
        <path
          key={`area-${index}`}
          d={path}
          fill={`url(#${metric === "overview" ? `${gradientId}-fill` : gradientId})`}
        />
      ))}
      {linePaths.map((path, index) => (
        <path
          key={`line-${index}`}
          d={path}
          fill="none"
          stroke={
            metric === "overview" ? `url(#${gradientId}-line)` : colors.line
          }
          strokeWidth="2"
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
  denseSpacing = false,
  fillAvailable = false,
  showHeading = true,
  onMetricChange,
}: {
  points: WeatherHourlyPoint[];
  config: WeatherViewConfig;
  settings: WeatherSettings;
  cap: number;
  presentation?: "compact" | "standard" | "tabbed";
  chartHeight?: number;
  denseSpacing?: boolean;
  fillAvailable?: boolean;
  showHeading?: boolean;
  onMetricChange: (metric: WeatherViewConfig["hourlyMetric"]) => void;
}): React.ReactElement {
  const gradientId = React.useId();
  const chartHostRef = React.useRef<HTMLDivElement>(null);
  const timelineRef = React.useRef<HTMLDivElement>(null);
  const timelineId = React.useId();
  const [scrollEdges, setScrollEdges] = React.useState({
    before: false,
    after: false,
  });
  const hourlyCount = Math.min(points.length, cap);
  React.useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    const updateEdges = (): void => {
      const before = timeline.scrollLeft > 1;
      const after =
        timeline.scrollLeft + timeline.clientWidth < timeline.scrollWidth - 1;
      setScrollEdges((current) =>
        current.before === before && current.after === after
          ? current
          : { before, after },
      );
    };
    const observer = new ResizeObserver(updateEdges);
    observer.observe(timeline);
    if (timeline.firstElementChild)
      observer.observe(timeline.firstElementChild);
    timeline.addEventListener("scroll", updateEdges, { passive: true });
    updateEdges();
    return () => {
      observer.disconnect();
      timeline.removeEventListener("scroll", updateEdges);
    };
  }, [hourlyCount, presentation]);
  const scrollHours = (direction: number): void => {
    const timeline = timelineRef.current;
    if (!timeline || !hourlyCount) return;
    const hourWidth = timeline.scrollWidth / hourlyCount;
    const hoursPerPage = Math.max(
      1,
      Math.floor(timeline.clientWidth / hourWidth) - 1,
    );
    timeline.scrollBy({
      left: direction * hoursPerPage * hourWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const [measuredChartWidth, setMeasuredChartWidth] = React.useState(340);
  const [measuredChartHeight, setMeasuredChartHeight] =
    React.useState(chartHeight);
  React.useEffect(() => {
    const host = chartHostRef.current;
    if (presentation === "compact" || !host) return;
    const observer = new ResizeObserver(() => {
      setMeasuredChartWidth(Math.floor(host.clientWidth));
      const nextHeight = Math.max(16, Math.floor(host.clientHeight));
      setMeasuredChartHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [chartHeight, fillAvailable, presentation]);
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
      className={cn(
        "min-w-0 rounded-md border bg-card",
        fillAvailable && "flex min-h-0 flex-1 flex-col",
        denseSpacing ? "p-1.5" : "p-2.5",
      )}
      aria-label="Hourly forecast"
    >
      {(showHeading || presentation === "tabbed") && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          {showHeading && <h3 className="text-xs font-semibold">Hourly</h3>}
          {presentation === "tabbed" && (
            <div className="flex max-w-full flex-wrap overflow-hidden rounded-md border text-[10px]">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "px-2 py-1",
                    config.hourlyMetric === key
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted",
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
      )}
      <div
        className={cn(
          "relative min-w-0",
          fillAvailable && "flex min-h-0 flex-1 flex-col",
          (showHeading || presentation === "tabbed") &&
            (denseSpacing ? "mt-1" : "mt-2"),
        )}
      >
        <div
          ref={timelineRef}
          id={timelineId}
          role="region"
          aria-label="Hourly forecast timeline"
          tabIndex={0}
          className={cn(
            "weather-timeline-scroll min-w-0 overflow-x-auto rounded-sm focus-visible:outline focus-visible:outline-ring",
            fillAvailable && "flex min-h-0 flex-1 flex-col",
          )}
          style={{
            maskImage: `linear-gradient(to right, ${scrollEdges.before ? "transparent, black 28px" : "black, black"}, ${scrollEdges.after ? "black calc(100% - 28px), transparent" : "black, black"})`,
          }}
        >
          <div
            className={cn(
              "grid shrink-0 gap-0.5",
              fillAvailable &&
                presentation === "compact" &&
                "flex-1 items-stretch",
            )}
            style={{
              minWidth,
              gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
            }}
          >
            {visible.map((point, index) => (
              <div
                key={point.time}
                aria-current={index === 0 ? "time" : undefined}
                className={cn(
                  cn(
                    "flex min-w-0 flex-col items-center rounded-md px-1 text-center",
                    fillAvailable &&
                      presentation === "compact" &&
                      "h-full justify-evenly",
                    denseSpacing ? "gap-0 py-0.5" : "gap-0.5 py-1",
                  ),
                  index === 0
                    ? "border border-primary/40 bg-primary/10"
                    : "bg-transparent",
                )}
              >
                <span className="text-[11px] leading-none text-muted-foreground">
                  {index === 0 ? "Now" : formatHourLabel(point.time, settings)}
                </span>
                {weatherIcon(point.weatherCode, true, true)}
                <span className="text-[11px] font-semibold leading-none">
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
            <div
              ref={chartHostRef}
              className={cn(
                "relative min-w-0 shrink-0",
                fillAvailable && "min-h-0 flex-1",
              )}
              style={{
                minWidth,
                minHeight: fillAvailable ? 0 : chartHeight,
                height: fillAvailable ? undefined : chartHeight,
              }}
            >
              <TemperatureAreaChart
                points={visible}
                metric={config.hourlyMetric}
                settings={settings}
                gradientId={`weather-hourly-${gradientId}`}
                width={measuredChartWidth}
                height={fillAvailable ? measuredChartHeight : chartHeight}
              />
            </div>
          )}
          {presentation !== "compact" && (
            <div
              className="mt-1 grid shrink-0 gap-0.5"
              style={{
                minWidth,
                gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`,
              }}
            >
              {visible.map((point) =>
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
                ),
              )}
            </div>
          )}
        </div>
        {(["before", "after"] as const).map(
          (edge) =>
            scrollEdges[edge] && (
              <button
                key={edge}
                type="button"
                aria-label={
                  edge === "before" ? "Show earlier hours" : "Show later hours"
                }
                aria-controls={timelineId}
                onClick={() => scrollHours(edge === "before" ? -1 : 1)}
                className={cn(
                  "absolute top-1/2 z-10 -translate-y-1/2 rounded-full border bg-card p-0.5 text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-ring",
                  edge === "before" ? "left-0" : "right-0",
                )}
              >
                {edge === "before" ? (
                  <ChevronLeft className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ),
        )}
      </div>
    </section>
  );
}
