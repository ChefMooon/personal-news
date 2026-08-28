import React from "react";
import { Globe } from "lucide-react";
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
  skyArcPosition,
  solarStateLabel,
  upcomingGlobalEvents,
} from "./astronomy-display";
import {
  HorizonEventIcon,
  MoonPhaseGlyph,
  SunGlyph,
} from "../weather/AstronomyStrip";

export type AstronomyTimeFormat = WeatherSettings["timeFormat"];

export function astronomyGroupData<T>(
  group: { status: string; data: T | null } | undefined,
): T | null {
  return group?.status === "unavailable" ? null : (group?.data ?? null);
}

function timeValue(
  time: number | null | undefined,
  timezone: string | null,
  format: AstronomyTimeFormat,
): string {
  return timezone && time != null
    ? (formatHorizonTime(time, timezone, format) ?? "Unavailable")
    : "Unavailable";
}

function dateValue(
  time: number | null | undefined,
  timezone: string | null,
  format: AstronomyTimeFormat,
): string {
  return timezone && time != null
    ? (formatNextPhaseDateTime(time, timezone, format) ?? "Unavailable")
    : "Unavailable";
}

function SmallHorizonRow({
  label,
  time,
  body,
  direction,
  timezone,
  timeFormat,
}: {
  label: string;
  time: number | null | undefined;
  body: "sun" | "moon";
  direction: "rise" | "set";
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <HorizonEventIcon body={body} direction={direction} />
        <span>{label}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums">
        {timeValue(time, timezone, timeFormat)}
      </span>
    </div>
  );
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
              ? `${next.label} ${timeValue(next.time, timezone, timeFormat)}`
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
              ? dateValue(milestone.time, timezone, timeFormat)
              : "Next phase unavailable"}
          </p>
        </div>
      )}
      {!compact && events.length > 0 && (
        <div className="min-w-0 sm:col-span-3">
          <h3 className="mb-1.5 text-xs font-semibold">Upcoming events</h3>
          <EventList
            events={events}
            timezone={timezone}
            timeFormat={timeFormat}
          />
        </div>
      )}
    </div>
  );
}

function EventList({
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
            {dateValue(event.time, timezone, timeFormat)}
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
      <AstronomySkyArc horizon={horizon} />
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
          <EventList
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

export function AstronomySkyArc({
  horizon,
  compact = false,
}: {
  horizon: AstronomyHorizonData | null;
  compact?: boolean;
}): React.ReactElement {
  const sunPosition = horizon
    ? skyArcPosition(horizon.sunAltitude, horizon.sunAzimuth)
    : null;
  const moonPosition = horizon
    ? skyArcPosition(horizon.moonAltitude, horizon.moonAzimuth)
    : null;

  const plotPoint = (position: {
    xPercent: number;
    yPercent: number;
  }): { x: number; y: number } => ({
    x: 24 + (position.xPercent / 100) * 272,
    y: 134 - (position.yPercent / 100) * 108,
  });
  const sunPoint = sunPosition ? plotPoint(sunPosition) : null;
  const moonPoint = moonPosition ? plotPoint(moonPosition) : null;

  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sky arc
      </h3>
      <div className="min-w-0 rounded-md border bg-card p-3 shadow-sm">
        <div className="relative min-w-0">
          <svg
            role="img"
            aria-label="Sky arc showing the current Sun and Moon positions"
            viewBox="0 0 320 170"
            className={cn(
              "block h-auto w-full",
              compact ? "max-h-32" : "max-h-64",
            )}
          >
            <defs>
              <linearGradient id="sky-arc-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="hsl(var(--primary) / 0.12)" />
                <stop offset="1" stopColor="hsl(var(--background))" />
              </linearGradient>
              <filter
                id="sky-arc-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="2.5" />
              </filter>
            </defs>
            <path
              d="M 24 134 A 136 108 0 0 1 296 134 L 24 134 Z"
              className="fill-[url(#sky-arc-fill)]"
            />
            <path
              d="M 24 134 A 136 108 0 0 1 296 134"
              fill="none"
              className="stroke-border"
              strokeWidth="1.5"
            />
            <line
              x1="16"
              y1="134"
              x2="304"
              y2="134"
              className="stroke-border/90"
              strokeDasharray="3 4"
            />
            {[24, 92, 160, 228, 296].map((x) => (
              <line
                key={x}
                x1={x}
                y1="130"
                x2={x}
                y2="138"
                className="stroke-muted-foreground/70"
              />
            ))}
            <text x="18" y="153" fontSize="9" className="fill-muted-foreground">
              East
            </text>
            <text x="151" y="22" fontSize="9" className="fill-muted-foreground">
              Zenith
            </text>
            <text
              x="270"
              y="153"
              fontSize="9"
              className="fill-muted-foreground"
            >
              West
            </text>
            {sunPoint && (
              <g>
                <circle
                  cx={sunPoint.x}
                  cy={sunPoint.y}
                  r="12"
                  className="fill-amber-300/30"
                  filter="url(#sky-arc-glow)"
                />
                <circle
                  cx={sunPoint.x}
                  cy={sunPoint.y}
                  r="7"
                  className="fill-amber-300 stroke-amber-100"
                  strokeWidth="1.5"
                />
                <text
                  x={sunPoint.x + 11}
                  y={sunPoint.y + 4}
                  fontSize="10"
                  className="fill-foreground"
                >
                  Sun
                </text>
              </g>
            )}
            {moonPoint && (
              <g>
                <circle
                  cx={moonPoint.x}
                  cy={moonPoint.y}
                  r="11"
                  className="fill-sky-300/25"
                  filter="url(#sky-arc-glow)"
                />
                <circle
                  cx={moonPoint.x}
                  cy={moonPoint.y}
                  r="6"
                  className="fill-sky-200 stroke-sky-100"
                  strokeWidth="1.5"
                />
                <text
                  x={moonPoint.x + 10}
                  y={moonPoint.y + 4}
                  fontSize="10"
                  className="fill-foreground"
                >
                  Moon
                </text>
              </g>
            )}
          </svg>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            Sun: {formatDegrees(horizon?.sunAltitude) ?? "Unavailable"}
          </span>
          <span className="ml-auto">
            Moon: {formatDegrees(horizon?.moonAltitude) ?? "Unavailable"}
          </span>
        </div>
        {!sunPoint && !moonPoint && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Position geometry unavailable for this snapshot.
          </p>
        )}
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
            Rise {timeValue(entry?.riseTime, timezone, timeFormat)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Set {timeValue(entry?.setTime, timezone, timeFormat)}
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
                {timeValue(time, timezone, timeFormat)}
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

export function AstronomySmall({
  astronomy,
  timezone,
  timeFormat,
}: AstronomyProps): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const moon = astronomyGroupData(astronomy?.groups.moon);
  const milestone = nextPrimaryPhaseMilestone(astronomy);

  return (
    <div className="grid min-w-0 gap-x-4 gap-y-3 min-[360px]:grid-cols-2">
      <div className="col-span-full flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Astronomy
        </span>
        <Badge variant="secondary" className="max-w-[65%]">
          <span className="truncate">
            {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
          </span>
        </Badge>
      </div>

      <section className="min-w-0 space-y-1.5">
        <h3 className="flex h-10 items-center gap-2 text-xs font-semibold">
          <SunGlyph />
          Sun
        </h3>
        <SmallHorizonRow
          label="Sunrise"
          time={horizon?.sun.riseTime}
          body="sun"
          direction="rise"
          timezone={timezone}
          timeFormat={timeFormat}
        />
        <SmallHorizonRow
          label="Sunset"
          time={horizon?.sun.setTime}
          body="sun"
          direction="set"
          timezone={timezone}
          timeFormat={timeFormat}
        />
      </section>

      <div className="min-w-0 space-y-3">
        <section className="min-w-0 space-y-1.5">
          <div className="flex h-10 min-w-0 items-center gap-3">
            <MoonPhaseGlyph
              phaseAngle={moon?.phaseAngle ?? null}
              illuminationPercent={moon?.illuminationPercent}
              label={
                moon
                  ? `${moonPhaseDisplayName(moon.phaseName)}, ${Math.round(moon.illuminationPercent)}% illuminated`
                  : "Moon phase unavailable"
              }
              size={36}
            />
            <div className="min-w-0">
              <h3 className="text-xs font-semibold">Moon</h3>
              <p className="truncate text-[11px] text-muted-foreground">
                {moon
                  ? `${Math.round(moon.illuminationPercent)}% illuminated`
                  : "Moon data unavailable"}
              </p>
            </div>
          </div>
          <SmallHorizonRow
            label="Moonrise"
            time={horizon?.moon.riseTime}
            body="moon"
            direction="rise"
            timezone={timezone}
            timeFormat={timeFormat}
          />
          <SmallHorizonRow
            label="Moonset"
            time={horizon?.moon.setTime}
            body="moon"
            direction="set"
            timezone={timezone}
            timeFormat={timeFormat}
          />
        </section>

        <section className="min-w-0 space-y-1">
          <h3 className="text-xs font-semibold">Next phase</h3>
          <p className="truncate text-xs font-medium">
            {milestone?.name
              ? moonPhaseDisplayName(milestone.name)
              : "Unavailable"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {milestone
              ? dateValue(milestone.time, timezone, timeFormat)
              : "Next phase unavailable"}
          </p>
        </section>
      </div>
    </div>
  );
}
export function AstronomyMedium({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  eventLimit = 5,
}: AstronomyProps & { eventLimit?: number }): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const events = upcomingGlobalEvents(
    astronomyGroupData(astronomy?.groups.events),
    nowSeconds,
  ).slice(0, eventLimit);

  return (
    <div className="min-w-0 space-y-3">
      <AstronomySummaryPrimitives
        astronomy={astronomy}
        timezone={timezone}
        timeFormat={timeFormat}
        nowSeconds={nowSeconds}
        eventLimit={0}
        showSunAltitude={false}
        showNextRiseSet={false}
      />
      <div className="grid min-w-0 gap-3 min-[560px]:grid-cols-2">
        <AstronomySkyArc horizon={horizon} compact />
        <section className="flex h-full min-w-0 w-full flex-col">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Daily timetable
          </h3>
          <div className="flex min-h-0 flex-1">
            <Timetable
              horizon={horizon}
              timezone={timezone}
              timeFormat={timeFormat}
              compact
            />
          </div>
        </section>
      </div>
      <section className="min-w-0">
        <h3 className="mb-1.5 text-xs font-semibold">Upcoming events</h3>
        {events.length > 0 ? (
          <EventList
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
export function AstronomyLarge({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  detailed,
}: AstronomyProps & { detailed: boolean }): React.ReactElement {
  return detailed ? (
    <AstronomyDetailedPrimitives
      astronomy={astronomy}
      timezone={timezone}
      timeFormat={timeFormat}
      nowSeconds={nowSeconds}
    />
  ) : (
    <AstronomySummaryPrimitives
      astronomy={astronomy}
      timezone={timezone}
      timeFormat={timeFormat}
      nowSeconds={nowSeconds}
      eventLimit={5}
    />
  );
}

interface AstronomyProps {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  nowSeconds: number;
}
