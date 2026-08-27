import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Globe,
  MoonStar,
  RefreshCcw,
  RotateCcw,
  Settings2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { useAstronomyEnabled } from "../../contexts/AstronomyEnabledContext";
import {
  DEFAULT_ASTRONOMY_VIEW_CONFIG,
  resolveAstronomyLocationId,
  shouldFallbackToWeatherDefault,
  useAstronomyConfig,
  type AstronomyViewConfig,
} from "../../hooks/useAstronomyConfig";
import { useAstronomySnapshot } from "../../hooks/useAstronomySnapshot";
import { useAstronomyStatus } from "../../hooks/useAstronomyStatus";
import { useNowMilliseconds } from "../../hooks/useNowMilliseconds";
import { useWeatherLocations } from "../../hooks/useWeatherLocations";
import { useWeatherSettings } from "../../hooks/useWeatherSettings";
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
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { cn } from "../../lib/utils";
import { registerRendererModule } from "../registry";
// The glyph is a component, so it imports from the Weather strip's tsx module
// directly rather than through the pure helper chain.
import {
  HorizonEventIcon,
  MoonPhaseGlyph,
  SunGlyph,
} from "../weather/AstronomyStrip";
import type {
  AstronomyGlobalEvent,
  AstronomyHorizonData,
  AstronomyMoonData,
  AstronomySnapshot,
  WeatherLocation,
} from "../../../../shared/ipc-types";
import { IPC } from "../../../../shared/ipc-types";
import type { AstronomyRefreshResult } from "../../../../shared/ipc-types";
import {
  clampSynodicProgress,
  countdownLabel,
  eventFamilyLabel,
  formatCalculatedAt,
  formatDegrees,
  formatHorizonTime,
  formatKilometers,
  formatMagnitudeValue,
  formatNextPhaseDateTime,
  horizonGeometryState,
  moonPhaseDisplayName,
  nearestSynodicMilestone,
  nextPrimaryPhaseMilestone,
  nextRiseSetItem,
  planetsInCanonicalOrder,
  planetDisplayState,
  skyArcPosition,
  solarStateLabel,
  SUMMARY_EVENT_LIMIT,
  upcomingGlobalEvents,
} from "./astronomy-display";

type TimeFormat = ReturnType<
  typeof useWeatherSettings
>["settings"]["timeFormat"];

function formatLocationLabel(
  location: Pick<WeatherLocation, "name" | "admin1" | "country">,
): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

/** Zone-guarded clock formatting; never falls back to the host timezone. */
function formatEventTime(
  unixSeconds: number | null | undefined,
  timezone: string | null,
  timeFormat: TimeFormat,
): string | null {
  if (!timezone) return null;
  return formatHorizonTime(unixSeconds, timezone, timeFormat);
}

function formatEventDateTime(
  unixSeconds: number | null | undefined,
  timezone: string | null,
  timeFormat: TimeFormat,
): string | null {
  if (!timezone) return null;
  return formatNextPhaseDateTime(unixSeconds, timezone, timeFormat);
}

function groupData<T>(
  group: { status: string; data: T | null } | undefined,
): T | null {
  if (!group || group.status === "unavailable") return null;
  return group.data ?? null;
}

function UnavailableRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-xs font-semibold",
          value == null && "font-normal text-muted-foreground",
        )}
      >
        {value ?? "Unavailable"}
      </span>
    </div>
  );
}

function SectionHeading({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function GlobalScopeBadge(): React.ReactElement {
  return (
    <Badge variant="outline" className="gap-1 px-1.5 py-0">
      <Globe className="h-2.5 w-2.5" aria-hidden="true" />
      <span>Global</span>
    </Badge>
  );
}

function SynodicProgressIndicator({
  progress,
}: {
  progress: number | null;
}): React.ReactElement {
  const clamped = clampSynodicProgress(progress);
  const milestone = nearestSynodicMilestone(progress);
  const accessibleLabel =
    clamped == null
      ? "Synodic progress unavailable"
      : `Synodic progress ${Math.round(clamped)} percent of the lunar cycle, nearest primary milestone ${milestone}`;

  return (
    <div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-label={accessibleLabel}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/60"
          style={{ width: `${clamped ?? 0}%` }}
        />
        {[25, 50, 75].map((tick) => (
          <span
            key={tick}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-background/80"
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9px] leading-none text-muted-foreground">
        <span>New Moon</span>
        <span>First Qtr</span>
        <span>Full Moon</span>
        <span>Third Qtr</span>
        <span>New Moon</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {clamped == null
          ? "Unavailable"
          : `${Math.round(clamped)}% through the cycle · nearest ${milestone}`}
      </p>
    </div>
  );
}

function MoonCard({
  moon,
  compact,
}: {
  moon: AstronomyMoonData | null;
  compact?: boolean;
}): React.ReactElement {
  if (!moon) {
    return (
      <div
        className={cn(
          "min-w-0 space-y-1.5",
          compact && "flex items-center gap-3",
        )}
      >
        <MoonPhaseGlyph phaseAngle={null} label="Moon phase unavailable" />
        <p className="truncate text-xs font-medium">Unavailable</p>
        <p className="text-[11px] text-muted-foreground">
          Moon data unavailable
        </p>
      </div>
    );
  }

  const trendLabel = moon.trend === "waxing" ? "Waxing" : "Waning";
  const TrendIcon = moon.trend === "waxing" ? TrendingUp : TrendingDown;
  const glyphLabel = `${moonPhaseDisplayName(moon.phaseName)}, ${Math.round(
    moon.illuminationPercent,
  )}% illuminated`;

  return (
    <div
      className={cn(
        "min-w-0 space-y-1.5",
        compact && "flex items-center gap-3",
      )}
    >
      <MoonPhaseGlyph
        phaseAngle={moon.phaseAngle}
        illuminationPercent={moon.illuminationPercent}
        label={glyphLabel}
        size={compact ? 40 : 48}
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">
          {moonPhaseDisplayName(moon.phaseName)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {Math.round(moon.illuminationPercent)}% illuminated
        </p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <TrendIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{trendLabel}</span>
        </p>
      </div>
      {!compact && (
        <>
          <SynodicProgressIndicator progress={moon.synodicProgress} />
          <UnavailableRow
            label="Distance"
            value={formatKilometers(moon.distanceKm)}
          />
        </>
      )}
    </div>
  );
}

function HorizonCard({
  horizon,
  timezone,
  timeFormat,
  nowSeconds,
  compact,
}: {
  horizon: AstronomyHorizonData | null;
  timezone: string | null;
  timeFormat: TimeFormat;
  nowSeconds: number;
  compact?: boolean;
}): React.ReactElement {
  const nextItem = nextRiseSetItem(horizon, nowSeconds);

  return (
    <div className="min-w-0 space-y-1.5">
      <UnavailableRow
        label="Sun altitude"
        value={
          horizon ? (formatDegrees(horizon.sunAltitude) ?? "Unavailable") : null
        }
      />
      {!compact && (
        <UnavailableRow
          label="Moon altitude"
          value={
            horizon
              ? (formatDegrees(horizon.moonAltitude) ?? "Unavailable")
              : null
          }
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          Next rise/set
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-xs font-semibold",
            nextItem == null && "font-normal text-muted-foreground",
          )}
        >
          {nextItem
            ? `${nextItem.label} ${
                formatEventTime(nextItem.time, timezone, timeFormat) ??
                "Unavailable"
              }`
            : "Unavailable"}
        </span>
      </div>
      <Badge variant="secondary" className="mt-1 max-w-full">
        <span className="truncate">
          {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
        </span>
      </Badge>
    </div>
  );
}

function NextPhaseCard({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: TimeFormat;
  nowSeconds: number;
}): React.ReactElement {
  const milestone = nextPrimaryPhaseMilestone(astronomy);

  if (!milestone) {
    return (
      <div className="min-w-0 space-y-1.5">
        <p className="truncate text-xs font-medium">Unavailable</p>
        <p className="text-[11px] text-muted-foreground">
          Next phase unavailable
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="truncate text-xs font-medium">
        {moonPhaseDisplayName(milestone.name)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {countdownLabel(milestone.time, nowSeconds)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {formatEventDateTime(milestone.time, timezone, timeFormat) ??
          "Unavailable"}
      </p>
    </div>
  );
}

function EventList({
  events,
  timezone,
  timeFormat,
  limit,
}: {
  events: AstronomyGlobalEvent[];
  timezone: string | null;
  timeFormat: TimeFormat;
  limit?: number;
}): React.ReactElement {
  const visible = limit != null ? events.slice(0, limit) : events;

  if (visible.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No upcoming global events listed.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {visible.map((event) => (
        <li
          key={`${event.family}:${event.label}:${event.time}`}
          className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1.5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-xs font-medium">{event.label}</span>
            <span className="text-[10px] text-muted-foreground">
              {eventFamilyLabel(event.family)}
            </span>
            <GlobalScopeBadge />
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatEventDateTime(event.time, timezone, timeFormat) ??
              "Unavailable"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SkyArcSection({
  horizon,
}: {
  horizon: AstronomyHorizonData | null;
}): React.ReactElement {
  const sunPos = horizon
    ? skyArcPosition(horizon.sunAltitude, horizon.sunAzimuth)
    : null;
  const moonPos = horizon
    ? skyArcPosition(horizon.moonAltitude, horizon.moonAzimuth)
    : null;

  // Plot coordinates inside the 200x110 viewBox: horizon at y=100, zenith at y=10.
  const toSvg = (position: {
    xPercent: number;
    yPercent: number;
  }): { x: number; y: number } => ({
    x: 10 + (position.xPercent / 100) * 180,
    y: 100 - (position.yPercent / 100) * 90,
  });
  const sunPoint = sunPos ? toSvg(sunPos) : null;
  const moonPoint = moonPos ? toSvg(moonPos) : null;

  return (
    <div className="min-w-0 space-y-2">
      <svg
        aria-hidden="true"
        viewBox="0 0 200 110"
        className="block h-auto w-full max-w-[280px]"
      >
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          className="stroke-border"
          strokeWidth="1.5"
        />
        <line
          x1="4"
          y1="100"
          x2="196"
          y2="100"
          className="stroke-border"
          strokeDasharray="3 4"
        />
        <line
          x1="100"
          y1="10"
          x2="100"
          y2="16"
          className="stroke-muted-foreground"
          strokeWidth="1"
        />
        {sunPoint && (
          <>
            <circle
              cx={sunPoint.x}
              cy={sunPoint.y}
              r="7"
              className="fill-amber-400/30"
            />
            <circle
              cx={sunPoint.x}
              cy={sunPoint.y}
              r="4"
              className="fill-amber-400"
            />
            <text
              x={sunPoint.x + 9}
              y={sunPoint.y + 3}
              fontSize="8"
              className="fill-muted-foreground"
            >
              Sun
            </text>
          </>
        )}
        {moonPoint && (
          <>
            <circle
              cx={moonPoint.x}
              cy={moonPoint.y}
              r="6"
              className="fill-sky-300/20"
            />
            <circle
              cx={moonPoint.x}
              cy={moonPoint.y}
              r="3.5"
              className="fill-sky-200"
            />
            <text
              x={moonPoint.x + 8}
              y={moonPoint.y + 3}
              fontSize="8"
              className="fill-muted-foreground"
            >
              Moon
            </text>
          </>
        )}
      </svg>
      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        <li>
          Sun — altitude{" "}
          <span className="font-medium text-foreground">
            {horizon
              ? (formatDegrees(horizon.sunAltitude) ?? "Unavailable")
              : "Unavailable"}
          </span>
          , azimuth{" "}
          <span className="font-medium text-foreground">
            {horizon
              ? (formatDegrees(horizon.sunAzimuth) ?? "Unavailable")
              : "Unavailable"}
          </span>
        </li>
        <li>
          Moon — altitude{" "}
          <span className="font-medium text-foreground">
            {horizon
              ? (formatDegrees(horizon.moonAltitude) ?? "Unavailable")
              : "Unavailable"}
          </span>
          , azimuth{" "}
          <span className="font-medium text-foreground">
            {horizon
              ? (formatDegrees(horizon.moonAzimuth) ?? "Unavailable")
              : "Unavailable"}
          </span>
        </li>
      </ul>
      <Badge variant="secondary" className="max-w-full">
        <span className="truncate">
          {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
        </span>
      </Badge>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Calculated geometry only. It does not account for clouds, terrain, or
        local light conditions.
      </p>
    </div>
  );
}

function LunarDetailSection({
  moon,
  timezone,
  timeFormat,
}: {
  moon: AstronomyMoonData | null;
  timezone: string | null;
  timeFormat: TimeFormat;
}): React.ReactElement {
  if (!moon) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Lunar detail unavailable.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
      <div className="min-w-0 space-y-1.5">
        <MoonCard moon={moon} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <SynodicProgressIndicator progress={moon.synodicProgress} />
      </div>
      <div className="min-w-0 space-y-1.5">
        <UnavailableRow
          label="Distance"
          value={formatKilometers(moon.distanceKm)}
        />
        <UnavailableRow
          label="Libration lat."
          value={formatDegrees(moon.librationLatitude)}
        />
        <UnavailableRow
          label="Libration long."
          value={formatDegrees(moon.librationLongitude)}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <UnavailableRow
          label="Next perigee"
          value={
            formatEventDateTime(moon.nextPerigeeTime, timezone, timeFormat) ??
            null
          }
        />
        <UnavailableRow
          label="Next apogee"
          value={
            formatEventDateTime(moon.nextApogeeTime, timezone, timeFormat) ??
            null
          }
        />
      </div>
    </div>
  );
}

const PLANET_STATE_CLASS: Record<string, string> = {
  Daylight:
    "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  "Below horizon": "",
  "Near horizon":
    "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30",
  "Potentially visible":
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  Unknown: "",
};

function PlanetGridSection({
  planets,
  timezone,
  timeFormat,
}: {
  planets: AstronomySnapshot["groups"]["planets"]["data"] | null;
  timezone: string | null;
  timeFormat: TimeFormat;
}): React.ReactElement {
  const entries = planetsInCanonicalOrder(planets);

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
      {entries.map(({ body, entry }) => {
        const displayState = entry ? planetDisplayState(entry) : "Unknown";
        return (
          <div key={body} className="min-w-0 rounded-md border p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h4 className="truncate text-xs font-semibold">{body}</h4>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 px-1.5 py-0",
                  PLANET_STATE_CLASS[displayState],
                )}
              >
                <span className="truncate">{displayState}</span>
              </Badge>
            </div>
            <div className="space-y-1">
              <UnavailableRow
                label="Mag"
                value={entry ? formatMagnitudeValue(entry.magnitude) : null}
              />
              <UnavailableRow
                label="Alt / Az"
                value={
                  entry
                    ? [
                        formatDegrees(entry.altitude),
                        formatDegrees(entry.azimuth),
                      ]
                        .map((part) => part ?? "-")
                        .join(" / ")
                    : null
                }
              />
              <UnavailableRow
                label="Illum"
                value={
                  entry && entry.illuminationPercent != null
                    ? `${Math.round(entry.illuminationPercent)}%`
                    : null
                }
              />
              <UnavailableRow
                label="Rise"
                value={
                  entry
                    ? formatEventTime(entry.riseTime, timezone, timeFormat)
                    : null
                }
              />
              <UnavailableRow
                label="Set"
                value={
                  entry
                    ? formatEventTime(entry.setTime, timezone, timeFormat)
                    : null
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimetableSection({
  horizon,
  timezone,
  timeFormat,
}: {
  horizon: AstronomyHorizonData | null;
  timezone: string | null;
  timeFormat: TimeFormat;
}): React.ReactElement {
  const rows: Array<{
    label: string;
    time: number | null;
    status: string;
    body: "sun" | "moon";
    direction: "rise" | "set";
  }> = [
    {
      label: "Sunrise",
      time: horizon?.sun.riseTime ?? null,
      status: horizon ? solarStateLabel(horizon.solarState) : "Unavailable",
      body: "sun",
      direction: "rise",
    },
    {
      label: "Sunset",
      time: horizon?.sun.setTime ?? null,
      status: horizon ? solarStateLabel(horizon.solarState) : "Unavailable",
      body: "sun",
      direction: "set",
    },
    {
      label: "Moonrise",
      time: horizon?.moon.riseTime ?? null,
      status: horizon
        ? horizonGeometryState(horizon.moonAltitude)
        : "Unavailable",
      body: "moon",
      direction: "rise",
    },
    {
      label: "Moonset",
      time: horizon?.moon.setTime ?? null,
      status: horizon
        ? horizonGeometryState(horizon.moonAltitude)
        : "Unavailable",
      body: "moon",
      direction: "set",
    },
  ];

  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full min-w-0 text-left text-xs">
        <caption className="sr-only">Local-day rise and set times</caption>
        <thead>
          <tr className="border-b bg-muted/30">
            <th
              scope="col"
              className="px-2 py-1.5 font-medium text-muted-foreground"
            >
              Event
            </th>
            <th
              scope="col"
              className="px-2 py-1.5 font-medium text-muted-foreground"
            >
              Time
            </th>
            <th
              scope="col"
              className="px-2 py-1.5 font-medium text-muted-foreground"
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b last:border-b-0">
              <td className="px-2 py-1.5 font-medium">
                <span className="flex items-center gap-1.5">
                  <HorizonEventIcon body={row.body} direction={row.direction} />
                  <span>{row.label}</span>
                </span>
              </td>
              <td className="px-2 py-1.5">
                {formatEventTime(row.time, timezone, timeFormat) ??
                  "Unavailable"}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {row.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventsDetailSection({
  events,
  timezone,
  timeFormat,
  nowSeconds,
}: {
  events: AstronomyGlobalEvent[] | null;
  timezone: string | null;
  timeFormat: TimeFormat;
  nowSeconds: number;
}): React.ReactElement {
  const upcoming = upcomingGlobalEvents(events, nowSeconds);

  if (upcoming.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No upcoming global events listed.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-2">
      {upcoming.map((event) => (
        <div
          key={`${event.family}:${event.label}:${event.time}`}
          className="min-w-0 space-y-1 rounded-md border p-2"
        >
          <p className="truncate text-xs font-medium">{event.label}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{eventFamilyLabel(event.family)}</span>
            <GlobalScopeBadge />
          </p>
          <p className="text-[11px]">
            {formatEventDateTime(event.time, timezone, timeFormat) ??
              "Unavailable"}
          </p>
        </div>
      ))}
    </div>
  );
}

function SummaryView({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: TimeFormat;
  nowSeconds: number;
}): React.ReactElement {
  const moon = groupData(astronomy?.groups.moon);
  const horizon = groupData(astronomy?.groups.horizon);
  const events = groupData(astronomy?.groups.events);
  const sortedEvents = useMemo(
    () => upcomingGlobalEvents(events, nowSeconds),
    [events, nowSeconds],
  );

  return (
    <section aria-label="Astronomy summary" className="space-y-3">
      {astronomy?.stale && (
        <Badge variant="secondary" aria-label="Astronomy data is stale">
          Stale
        </Badge>
      )}
      <div className="grid min-h-[92px] grid-cols-1 items-stretch gap-y-3 sm:grid-cols-3 sm:divide-x sm:divide-border [&>*]:sm:flex [&>*]:sm:flex-col [&>*]:sm:justify-center [&>*]:sm:px-4 [&>*]:sm:first:pl-0 [&>*]:sm:last:pr-0">
        <div className="min-w-0 space-y-1.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <SunGlyph />
            <span>Sun</span>
          </h3>
          <HorizonCard
            horizon={horizon}
            timezone={timezone}
            timeFormat={timeFormat}
            nowSeconds={nowSeconds}
            compact
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <HorizonEventIcon body="moon" direction="rise" />
            <span>Moon</span>
          </h3>
          <MoonCard moon={moon} compact />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <HorizonEventIcon body="moon" direction="set" />
            <span>Next phase</span>
          </h3>
          <NextPhaseCard
            astronomy={astronomy}
            timezone={timezone}
            timeFormat={timeFormat}
            nowSeconds={nowSeconds}
          />
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold">Upcoming events</h3>
        <EventList
          events={sortedEvents}
          timezone={timezone}
          timeFormat={timeFormat}
          limit={SUMMARY_EVENT_LIMIT}
        />
      </div>
    </section>
  );
}

function DetailedView({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: TimeFormat;
  nowSeconds: number;
}): React.ReactElement {
  const moon = groupData(astronomy?.groups.moon);
  const horizon = groupData(astronomy?.groups.horizon);
  const planets = groupData(astronomy?.groups.planets);
  const events = groupData(astronomy?.groups.events);

  return (
    <section aria-label="Astronomy detail" className="space-y-4">
      {astronomy?.stale && (
        <Badge variant="secondary" aria-label="Astronomy data is stale">
          Stale
        </Badge>
      )}

      <div className="min-w-0">
        <SectionHeading>Sky arc</SectionHeading>
        <SkyArcSection horizon={horizon} />
      </div>

      <Separator />

      <div className="min-w-0">
        <SectionHeading>Lunar detail</SectionHeading>
        <LunarDetailSection
          moon={moon}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      </div>

      <Separator />

      <div className="min-w-0">
        <SectionHeading>Planets</SectionHeading>
        <PlanetGridSection
          planets={planets}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      </div>

      <Separator />

      <div className="min-w-0">
        <SectionHeading>Daily timetable</SectionHeading>
        <TimetableSection
          horizon={horizon}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      </div>

      <Separator />

      <div className="min-w-0">
        <SectionHeading>Milestones and events</SectionHeading>
        <EventsDetailSection
          events={events}
          timezone={timezone}
          timeFormat={timeFormat}
          nowSeconds={nowSeconds}
        />
      </div>
    </section>
  );
}

interface AstronomySettingsPanelProps {
  config: AstronomyViewConfig;
  onChange: (config: AstronomyViewConfig) => void;
  locations: WeatherLocation[];
  defaultLocationId: string | null;
}

function AstronomySettingsPanel({
  config,
  onChange,
  locations,
  defaultLocationId,
}: AstronomySettingsPanelProps): React.ReactElement {
  const currentValue = config.locationId ?? "__default__";
  const defaultLocationLabel = useMemo(() => {
    if (!defaultLocationId) return "No default location selected";
    const currentDefault = locations.find(
      (location) => location.id === defaultLocationId,
    );
    return currentDefault
      ? formatLocationLabel(currentDefault)
      : "Use app default location";
  }, [defaultLocationId, locations]);

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pr-4">
          <div>
            <h3 className="mb-3 text-sm font-semibold">Location</h3>
            <label className="mb-2 block text-sm">Displayed location</label>
            <Select
              value={currentValue}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  locationId: value === "__default__" ? null : value,
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="Displayed location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  Use app default: {defaultLocationLabel}
                </SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {formatLocationLabel(location)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Saved locations are managed in the Weather widget and Settings -
              Weather.
            </p>
          </div>

          <Separator />

          <div>
            <h3 className="mb-3 text-sm font-semibold">View</h3>
            <label className="mb-2 block text-sm">View mode</label>
            <Select
              value={config.viewMode}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  viewMode: value as AstronomyViewConfig["viewMode"],
                })
              }
            >
              <SelectTrigger className="h-8" aria-label="View mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function AstronomyWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance();
  const widgetTitle = label ?? "Astronomy";
  const { enabled: featureEnabled } = useAstronomyEnabled();
  const { config, setConfig } = useAstronomyConfig(instanceId);
  const { locations, loading: locationsLoading } = useWeatherLocations();
  const { settings: weatherSettings, loading: settingsLoading } =
    useWeatherSettings();

  const effectiveLocationId = resolveAstronomyLocationId(
    config.locationId,
    locations,
    weatherSettings.defaultLocationId,
  );
  const selectedLocation =
    locations.find((location) => location.id === effectiveLocationId) ?? null;
  const timezone = selectedLocation?.timezone ?? null;

  const { snapshot, loading } = useAstronomySnapshot(
    effectiveLocationId,
    featureEnabled,
  );
  const { refetch: refetchStatus } = useAstronomyStatus(featureEnabled);

  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] =
    useState<AstronomyViewConfig | null>(null);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const lastManualRefreshAt = useRef<number | null>(null);
  const cardContentRef = useRef<HTMLDivElement | null>(null);

  const nowMilliseconds = useNowMilliseconds(
    featureEnabled && snapshot != null,
  );
  const nowSeconds = Math.floor(nowMilliseconds / 1000);

  // Persist the corrected instance configuration when the configured location
  // was removed and a valid Weather default can replace it.
  useEffect(() => {
    if (!featureEnabled || locationsLoading || settingsLoading) return;
    if (
      !shouldFallbackToWeatherDefault(
        config.locationId,
        locations,
        weatherSettings.defaultLocationId,
      )
    ) {
      return;
    }
    setConfig({ ...config, locationId: weatherSettings.defaultLocationId });
  }, [
    featureEnabled,
    config,
    setConfig,
    locations,
    locationsLoading,
    settingsLoading,
    weatherSettings.defaultLocationId,
  ]);

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

  const calculatedLabel = formatCalculatedAt(
    snapshot?.calculatedAt ?? null,
    timezone,
    weatherSettings.timeFormat,
  );

  const refreshNow = async (): Promise<void> => {
    if (!featureEnabled || !effectiveLocationId) return;
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
        IPC.ASTRONOMY_REFRESH,
        effectiveLocationId,
      )) as AstronomyRefreshResult;
      if (!result.ok) {
        toast.error(result.error ?? "Failed to refresh astronomy data.");
        return;
      }
      refetchStatus();
      toast.success(
        result.refreshedCount > 0
          ? "Astronomy data refreshed."
          : "No astronomy data was refreshed.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to refresh astronomy data.",
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
    setConfig(DEFAULT_ASTRONOMY_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_ASTRONOMY_VIEW_CONFIG);
  }

  const preview = (
    <div className="space-y-3">
      {!effectiveLocationId ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No saved Weather location available. Save a location in Settings -
          Weather or choose one in this widget's settings.
        </div>
      ) : loading && !snapshot ? (
        <p className="text-sm text-muted-foreground">Loading astronomy...</p>
      ) : (
        <>
          {!snapshot && (
            <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
              No cached astronomy data for this location yet. Use the refresh
              action or wait for the next scheduled update.
            </div>
          )}
          {config.viewMode === "detailed" ? (
            <DetailedView
              astronomy={snapshot}
              timezone={timezone}
              timeFormat={weatherSettings.timeFormat}
              nowSeconds={nowSeconds}
            />
          ) : (
            <SummaryView
              astronomy={snapshot}
              timezone={timezone}
              timeFormat={weatherSettings.timeFormat}
              nowSeconds={nowSeconds}
            />
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
            <CardTitle className="flex items-center gap-2 text-base">
              <MoonStar className="h-5 w-5 text-indigo-400" />
              {widgetTitle}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Calculated: {calculatedLabel ?? "Never"}
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => void refreshNow()}
                  disabled={refreshing || !effectiveLocationId}
                  aria-label="Refresh astronomy data"
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
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                        Reset all Astronomy widget settings to their defaults?
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
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Astronomy widget settings"
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
        <div className={isEditing ? "astronomy-card-edit" : undefined}>
          <div
            className={isEditing ? "astronomy-card-edit__preview" : undefined}
          >
            {preview}
          </div>
          {isEditing && (
            <div className="astronomy-card-edit__panel">
              <AstronomySettingsPanel
                config={config}
                onChange={setConfig}
                locations={locations}
                defaultLocationId={weatherSettings.defaultLocationId}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

registerRendererModule({
  id: "astronomy",
  displayName: "Astronomy",
  widget: AstronomyWidget,
});

export default AstronomyWidget;
