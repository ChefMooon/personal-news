import React from "react";
import { Globe, Moon, Sun } from "lucide-react";
import type {
  AstronomyGlobalEvent,
  AstronomyHorizonData,
  AstronomyPlanetData,
  AstronomySnapshot,
  WeatherSettings,
} from "../../../../shared/ipc-types";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import {
  eventFamilyLabel,
  compassDirection,
  altitudeGaugePercent,
  formatAltitudePosition,
  formatDegrees,
  formatHorizonTime,
  formatKilometers,
  formatMagnitudeValue,
  formatNextPhaseDateTime,
  horizonGeometryState,
  moonPhaseDisplayName,
  nextPrimaryPhaseMilestone,
  nextRiseSetItem,
  planetsInCanonicalOrder,
  planetDisplayState,
  solarStateLabel,
  upcomingGlobalEvents,
} from "./astronomy-display";
import {
  HorizonEventIcon,
  MoonPhaseGlyph,
  SunGlyph,
} from "../weather/AstronomyStrip";

export type AstronomyTimeFormat = WeatherSettings["timeFormat"];

export interface AstronomyPresetProps {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  nowSeconds: number;
}

export function astronomyGroupData<T>(
  group: { status: string; data: T | null } | undefined,
): T | null {
  return group?.status === "unavailable" ? null : (group?.data ?? null);
}

export function formatAstronomyTime(
  time: number | null | undefined,
  timezone: string | null,
  format: AstronomyTimeFormat,
): string {
  return timezone && time != null
    ? (formatHorizonTime(time, timezone, format) ?? "Unavailable")
    : "Unavailable";
}

export function formatAstronomyDateTime(
  time: number | null | undefined,
  timezone: string | null,
  format: AstronomyTimeFormat,
): string {
  return timezone && time != null
    ? (formatNextPhaseDateTime(time, timezone, format) ?? "Unavailable")
    : "Unavailable";
}

export function AstronomySummaryPrimitives({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  eventLimit,
  compact = false,
  showSunAltitude = true,
  showNextRiseSet = true,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  nowSeconds: number;
  eventLimit: number;
  compact?: boolean;
  showSunAltitude?: boolean;
  showNextRiseSet?: boolean;
}): React.ReactElement {
  const moon = astronomyGroupData(astronomy?.groups.moon);
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const events = upcomingGlobalEvents(
    astronomyGroupData(astronomy?.groups.events),
    nowSeconds,
  ).slice(0, eventLimit);
  const next = nextRiseSetItem(horizon, nowSeconds);
  const milestone = nextPrimaryPhaseMilestone(astronomy);

  return (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        compact ? "grid-cols-1" : "sm:grid-cols-3",
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <SunGlyph />
          Sun
        </h3>
        {showSunAltitude && (
          <p className="text-xs">
            Altitude: {formatDegrees(horizon?.sunAltitude) ?? "Unavailable"}
          </p>
        )}
        {showNextRiseSet && (
          <p className="truncate text-[11px] text-muted-foreground">
            Next:{" "}
            {next
              ? `${next.label} ${formatAstronomyTime(
                  next.time,
                  timezone,
                  timeFormat,
                )}`
              : "Unavailable"}
          </p>
        )}
        <Badge variant="secondary" className="max-w-full">
          <span className="truncate">
            {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
          </span>
        </Badge>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <MoonPhaseGlyph
          phaseAngle={moon?.phaseAngle ?? null}
          illuminationPercent={moon?.illuminationPercent}
          label={
            moon
              ? `${moonPhaseDisplayName(moon.phaseName)}, ${Math.round(moon.illuminationPercent)}% illuminated`
              : "Moon phase unavailable"
          }
          size={compact ? 36 : 44}
        />
        <div className="min-w-0">
          <h3 className="text-xs font-semibold">Moon</h3>
          <p className="truncate text-xs">
            {moon ? moonPhaseDisplayName(moon.phaseName) : "Unavailable"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {moon
              ? `${Math.round(moon.illuminationPercent)}% illuminated`
              : "Moon data unavailable"}
          </p>
        </div>
      </div>
      {!compact && (
        <div className="min-w-0 space-y-1.5">
          <h3 className="flex items-center gap-2 text-xs font-semibold">
            <HorizonEventIcon body="moon" direction="set" />
            Next phase
          </h3>
          <p className="truncate text-xs">
            {milestone?.name
              ? moonPhaseDisplayName(milestone.name)
              : "Unavailable"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {milestone
              ? formatAstronomyDateTime(milestone.time, timezone, timeFormat)
              : "Next phase unavailable"}
          </p>
        </div>
      )}
      {!compact && events.length > 0 && (
        <div className="min-w-0 sm:col-span-3">
          <h3 className="mb-1.5 text-xs font-semibold">Upcoming events</h3>
          <AstronomyEventList
            events={events}
            timezone={timezone}
            timeFormat={timeFormat}
          />
        </div>
      )}
    </div>
  );
}

export function AstronomyEventList({
  events,
  timezone,
  timeFormat,
}: {
  events: AstronomyGlobalEvent[];
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
}): React.ReactElement {
  return (
    <ul className="min-w-0 space-y-1.5">
      {events.map((event) => (
        <li
          key={`${event.family}:${event.label}:${event.time}`}
          className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1.5"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="max-w-full truncate text-xs font-medium">
              {event.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {eventFamilyLabel(event.family)}
            </span>
            <Badge variant="outline" className="gap-1 px-1.5 py-0">
              <Globe className="h-2.5 w-2.5" aria-hidden="true" />
              Global
            </Badge>
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatAstronomyDateTime(event.time, timezone, timeFormat)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AstronomyDetailedPrimitives({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  nowSeconds: number;
}): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const moon = astronomyGroupData(astronomy?.groups.moon);
  const planets = astronomyGroupData(astronomy?.groups.planets);
  const events = upcomingGlobalEvents(
    astronomyGroupData(astronomy?.groups.events),
    nowSeconds,
  );
  return (
    <div className="min-w-0 space-y-4">
      <AstronomyPositions horizon={horizon} />
      <section className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lunar detail
        </h3>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          <p className="min-w-0 text-xs">
            Phase: {moon ? moonPhaseDisplayName(moon.phaseName) : "Unavailable"}
          </p>
          <p className="min-w-0 text-xs">
            Illumination:{" "}
            {moon ? `${Math.round(moon.illuminationPercent)}%` : "Unavailable"}
          </p>
          <p className="min-w-0 text-xs">
            Distance: {formatKilometers(moon?.distanceKm) ?? "Unavailable"}
          </p>
        </div>
      </section>
      <section className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Planets
        </h3>
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
          <PlanetGrid
            planets={planets}
            timezone={timezone}
            timeFormat={timeFormat}
          />
        </div>
      </section>
      <section className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Daily timetable
        </h3>
        <Timetable
          horizon={horizon}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      </section>
      <section className="min-w-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Milestones and events
        </h3>
        {events.length ? (
          <AstronomyEventList
            events={events}
            timezone={timezone}
            timeFormat={timeFormat}
          />
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No upcoming global events listed.
          </p>
        )}
      </section>
    </div>
  );
}

export function AstronomyPositions({
  horizon,
  compact = false,
}: {
  horizon: AstronomyHorizonData | null;
  compact?: boolean;
}): React.ReactElement {
  const bodies = [
    {
      name: "Sun",
      altitude: horizon?.sunAltitude,
      azimuth: horizon?.sunAzimuth,
    },
    {
      name: "Moon",
      altitude: horizon?.moonAltitude,
      azimuth: horizon?.moonAzimuth,
    },
  ] as const;

  return (
    <section className="@container min-w-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sun &amp; Moon positions
      </h3>
      <div
        className={cn(
          "grid min-w-0 grid-cols-1 rounded-md border bg-card",
          "@min-[34rem]:grid-cols-2",
          compact ? "gap-2 p-2" : "gap-4 p-4",
        )}
      >
        {bodies.map(({ name, altitude, azimuth }) => {
          const direction = compassDirection(azimuth);
          const relative = formatAltitudePosition(altitude);
          return (
            <div key={name} className="min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold">{name}</p>
                <p className="text-xs tabular-nums">{relative}</p>
                <p className="text-[11px] text-muted-foreground">
                  {direction
                    ? `${direction} · ${formatDegrees(azimuth)}`
                    : "Direction unavailable"}
                </p>
              </div>
            </div>
          );
        })}
        <div
          className="relative col-span-full mt-1 h-20"
          aria-hidden="true"
        >
          <div className="absolute inset-x-0 top-1/2 border-t-2 border-foreground/60" />
          <div className="absolute bottom-0 left-1/4 top-0 border-l border-dashed border-border" />
          <div className="absolute bottom-0 left-3/4 top-0 border-l border-dashed border-border" />
          {bodies.map(({ name, altitude }, index) => {
            const gauge = altitudeGaugePercent(altitude);
            const isSun = name === "Sun";
            const BodyIcon = isSun ? Sun : Moon;
            return gauge == null ? null : (
              <span
                key={name}
                className={cn(
                  "absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 ring-card",
                  isSun
                    ? "bg-amber-200/30 text-amber-600 drop-shadow-[0_0_6px_rgba(245,158,11,0.7)] dark:bg-amber-200/20 dark:text-amber-300"
                    : "bg-sky-200/35 text-sky-700 drop-shadow-[0_0_6px_rgba(125,211,252,0.65)] dark:bg-sky-200/20 dark:text-sky-200",
                )}
                style={{
                  left: index === 0 ? "25%" : "75%",
                  top: `${100 - gauge}%`,
                }}
              >
                <BodyIcon
                  aria-hidden="true"
                  className={cn(
                    "h-4 w-4",
                    !isSun && "fill-sky-100/60 dark:fill-sky-100/40",
                  )}
                  strokeWidth={2.25}
                />
              </span>
            );
          })}
        </div>
        <div className="col-span-full grid grid-cols-2 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
          <span>Sun</span>
          <span>Moon</span>
        </div>
        <p className="col-span-full text-center text-xs font-medium text-foreground" aria-hidden="true">
          Horizon · 0°
        </p>
      </div>
    </section>
  );
}

function PlanetGrid({
  planets,
  timezone,
  timeFormat,
}: {
  planets: AstronomyPlanetData[] | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
}): React.ReactElement {
  return (
    <>
      {planetsInCanonicalOrder(planets).map(({ body, entry }) => (
        <div key={body} className="min-w-0 rounded-md border p-2">
          <div className="mb-1.5 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold">{body}</h4>
            <Badge variant="outline" className="shrink-0">
              {entry ? planetDisplayState(entry) : "Unknown"}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mag {formatMagnitudeValue(entry?.magnitude) ?? "Unavailable"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Rise {formatAstronomyTime(entry?.riseTime, timezone, timeFormat)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Set {formatAstronomyTime(entry?.setTime, timezone, timeFormat)}
          </p>
        </div>
      ))}
    </>
  );
}

export function Timetable({
  horizon,
  timezone,
  timeFormat,
  compact = false,
}: {
  horizon: AstronomyHorizonData | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  compact?: boolean;
}): React.ReactElement {
  const rows = [
    ["Sunrise", horizon?.sun.riseTime, "sun", "rise"],
    ["Sunset", horizon?.sun.setTime, "sun", "set"],
    ["Moonrise", horizon?.moon.riseTime, "moon", "rise"],
    ["Moonset", horizon?.moon.setTime, "moon", "set"],
  ] as const;
  return (
    <div className="h-full w-full overflow-hidden rounded-md border">
      <table
        className={cn(
          "w-full min-w-0 text-left text-xs",
          compact && "h-full table-fixed",
        )}
      >
        <tbody>
          {rows.map(([label, time, body, direction]) => (
            <tr
              key={label}
              className={cn("border-b last:border-b-0", compact && "h-1/4")}
            >
              <td className={cn("px-2", compact ? "py-1" : "py-1.5")}>
                <span className="flex items-center gap-1.5">
                  <HorizonEventIcon body={body} direction={direction} />
                  {label}
                </span>
              </td>
              <td className={cn("px-2", compact ? "py-1" : "py-1.5")}>
                {formatAstronomyTime(time, timezone, timeFormat)}
              </td>
              <td
                className={cn(
                  "px-2 text-muted-foreground",
                  compact ? "py-1" : "py-1.5",
                )}
              >
                {horizon
                  ? horizonGeometryState(
                      body === "sun"
                        ? horizon.sunAltitude
                        : horizon.moonAltitude,
                    )
                  : "Unavailable"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
