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
  formatEventDate,
  formatAstronomicalUnits,
  compassDirection,
  altitudeGaugePercent,
  formatAltitudePosition,
  formatDegrees,
  formatHorizonTime,
  formatKilometers,
  formatMagnitudeValue,
  formatNextPhaseDateTime,
  clampSynodicProgress,
  formatCalculatedAt,
  horizonGeometryState,
  moonPhaseDisplayName,
  nearestSynodicMilestone,
  nextPrimaryPhaseMilestone,
  nextRiseSetItem,
  planetsInCanonicalOrder,
  planetDisplayState,
  solarStateLabel,
  chronologicalGlobalEvents,
  upcomingGlobalEvents,
} from "./astronomy-display";
import {
  HorizonEventIcon,
  MoonPhaseGlyph,
  SunGlyph,
} from "../weather/AstronomyStrip";

import { PlanetGlyph } from "./PlanetGlyph";

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

  return (
    <div
      className={cn(
        "grid min-w-0 items-stretch gap-3",
        compact
          ? "grid-cols-1"
          : "grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]",
      )}
    >
      <div className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold">
          <SunGlyph themeColors />
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
      <div className="flex min-w-0 flex-col justify-center gap-2 rounded-md border bg-muted/30 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <MoonPhaseGlyph
            themeColors
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
        <p className="flex flex-wrap justify-between gap-x-2 text-[11px] text-muted-foreground">
          <span>Distance</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatKilometers(moon?.distanceKm) ?? "Unavailable"}
          </span>
        </p>
      </div>
      {!compact && (
        <AstronomyNextPhaseSummary
          astronomy={astronomy}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      )}
      {!compact && events.length > 0 && (
        <div className="col-span-full min-w-0">
          <AstronomyUpcomingEvents
            events={events}
            timezone={timezone}
            timeFormat={timeFormat}
          />
        </div>
      )}
    </div>
  );
}

function AstronomyNextPhaseSummary({
  astronomy,
  timezone,
  timeFormat,
}: Pick<
  AstronomyPresetProps,
  "astronomy" | "timezone" | "timeFormat"
>): React.ReactElement {
  const milestone = astronomyGroupData(astronomy?.groups.moon)
    ? nextPrimaryPhaseMilestone(astronomy)
    : null;
  return (
    <section className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold">
        <HorizonEventIcon body="moon" direction="set" themeColors />
        Next phase
      </h3>
      <p className="truncate text-xs">
        {milestone?.name ? moonPhaseDisplayName(milestone.name) : "Unavailable"}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {milestone
          ? formatAstronomyDateTime(milestone.time, timezone, timeFormat)
          : "Next phase unavailable"}
      </p>
    </section>
  );
}

export function AstronomyEventList({
  events,
  timezone,
  timeFormat,
  dateFirst = false,
  twoColumns = false,
}: {
  events: AstronomyGlobalEvent[];
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  dateFirst?: boolean;
  twoColumns?: boolean;
}): React.ReactElement {
  return (
    <ul
      className={cn(
        "min-w-0",
        twoColumns
          ? "grid gap-2 @min-[44rem]/events:grid-cols-2"
          : "rounded-md border bg-card",
      )}
    >
      {events.map((event) => (
        <li
          key={`${event.family}:${event.label}:${event.time}`}
          className={cn(
            "min-w-0 gap-x-4 gap-y-2 px-3 py-2.5",
            twoColumns
              ? "rounded-md border bg-card"
              : "border-b last:border-b-0",
            dateFirst
              ? "grid grid-cols-[5.5rem_minmax(0,1fr)] items-start"
              : "flex flex-wrap items-center justify-between",
          )}
        >
          {dateFirst && (
            <time className="min-w-0 text-xs tabular-nums">
              <span className="block font-semibold">
                {formatEventDate(event.time, timezone)}
              </span>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {formatAstronomyTime(event.time, timezone, timeFormat)}
              </span>
            </time>
          )}
          <div
            className={cn(
              "min-w-0",
              dateFirst ? "space-y-1" : "flex flex-wrap items-center gap-2",
            )}
          >
            <p className="max-w-full break-words text-xs font-medium">
              {event.label}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {eventFamilyLabel(event.family)}
              </span>
              <Badge variant="outline" className="gap-1 px-1.5 py-0">
                <Globe className="h-2.5 w-2.5" aria-hidden="true" />
                Global
              </Badge>
            </div>
          </div>
          {!dateFirst && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatAstronomyDateTime(event.time, timezone, timeFormat)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AstronomyUpcomingEvents({
  events,
  timezone,
  timeFormat,
}: Pick<AstronomyPresetProps, "timezone" | "timeFormat"> & {
  events: AstronomyGlobalEvent[];
}): React.ReactElement {
  return (
    <section className="@container/events min-w-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Upcoming events
      </h3>
      {events.length > 0 ? (
        <AstronomyEventList
          dateFirst
          twoColumns
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
  );
}

export function AstronomyDetailedPrimitives({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  fullSnapshot = false,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  nowSeconds: number;
  fullSnapshot?: boolean;
}): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const planets = astronomyGroupData(astronomy?.groups.planets);
  const eventData = astronomyGroupData(astronomy?.groups.events);
  const events = fullSnapshot
    ? chronologicalGlobalEvents(eventData)
    : upcomingGlobalEvents(eventData, nowSeconds);
  return (
    <div className="@container/details min-w-0 space-y-5">
      {fullSnapshot && (
        <AstronomySnapshotMetadata
          astronomy={astronomy}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      )}
      <AstronomySummaryPrimitives
        astronomy={astronomy}
        timezone={timezone}
        timeFormat={timeFormat}
        nowSeconds={nowSeconds}
        eventLimit={0}
        showSunAltitude={false}
        showNextRiseSet={false}
      />
      {fullSnapshot && (
        <AstronomyMoonDetails
          astronomy={astronomy}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      )}
      <div className="grid min-w-0 items-stretch gap-4 @min-[44rem]/details:grid-cols-2">
        {fullSnapshot ? (
          <section className="min-w-0 space-y-2">
            <GroupStatusLabel
              label="Horizon"
              status={astronomy?.groups.horizon.status}
            />
            <p className="text-[11px] text-muted-foreground">
              Positions and sky states are calculated geometry, not live
              observations.
            </p>
            <AstronomyPositions horizon={horizon} />
          </section>
        ) : (
          <AstronomyPositions horizon={horizon} />
        )}
        <section className="flex min-w-0 flex-col">
          {fullSnapshot && (
            <GroupStatusLabel
              label="Horizon"
              status={astronomy?.groups.horizon.status}
            />
          )}
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Daily timetable
          </h3>
          <Timetable
            horizon={horizon}
            timezone={timezone}
            timeFormat={timeFormat}
            compact
          />
        </section>
      </div>

      <section className="@container/planets min-w-0">
        {fullSnapshot ? (
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Planets
            </h3>
            <GroupStatusLabel
              label="Planets"
              status={astronomy?.groups.planets.status}
            />
          </div>
        ) : (
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Planets
          </h3>
        )}
        {fullSnapshot && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            Calculated positions and sky states are not live observations or
            visibility guarantees.
          </p>
        )}
        {fullSnapshot && planets == null ? (
          <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            Planet data is unavailable.
          </p>
        ) : fullSnapshot && planets?.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
            No planets were returned.
          </p>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-2 @min-[26rem]/planets:grid-cols-12 @min-[87rem]/planets:grid-cols-7">
            <PlanetGrid
              planets={planets}
              timezone={timezone}
              timeFormat={timeFormat}
              includeOtherBodies={fullSnapshot}
              includeExtendedData={fullSnapshot}
            />
          </div>
        )}
      </section>
      {fullSnapshot ? (
        <AstronomyAllGlobalEvents
          events={events}
          status={astronomy?.groups.events.status}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      ) : (
        <AstronomyUpcomingEvents
          events={events ?? []}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      )}
    </div>
  );
}

function AstronomySnapshotMetadata({
  astronomy,
  timezone,
  timeFormat,
}: Pick<
  AstronomyPresetProps,
  "astronomy" | "timezone" | "timeFormat"
>): React.ReactElement {
  const calculatedAt = formatCalculatedAt(
    astronomy?.calculatedAt,
    timezone,
    timeFormat,
  );
  const forTimestamp = formatCalculatedAt(
    astronomy?.forTimestamp,
    timezone,
    timeFormat,
  );
  const groupStatuses = [
    ["Moon", astronomy?.groups.moon.status],
    ["Horizon", astronomy?.groups.horizon.status],
    ["Planets", astronomy?.groups.planets.status],
    ["Global events", astronomy?.groups.events.status],
  ] as const;

  return (
    <section
      aria-label="Astronomy snapshot status"
      className="min-w-0 space-y-3 rounded-md border bg-muted/20 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">Snapshot</span>
        <Badge variant={astronomy?.stale ? "destructive" : "secondary"}>
          {astronomy?.stale ? "Stale snapshot" : "Fresh snapshot"}
        </Badge>
        <Badge variant="outline">{astronomy?.status ?? "Unavailable"}</Badge>
      </div>
      <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 text-xs @min-[28rem]/details:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Target time</dt>
          <dd className="break-words tabular-nums">
            {forTimestamp ?? "Unavailable"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Calculated at</dt>
          <dd className="break-words tabular-nums">
            {calculatedAt ?? "Unavailable"}
          </dd>
        </div>
      </dl>
      <div
        className="flex min-w-0 flex-wrap gap-1.5"
        aria-label="Data group status"
      >
        {groupStatuses.map(([label, status]) => (
          <GroupStatusLabel key={label} label={label} status={status} />
        ))}
      </div>
    </section>
  );
}

function GroupStatusLabel({
  label,
  status,
}: {
  label: string;
  status: string | undefined;
}): React.ReactElement {
  const text =
    status === "fresh"
      ? "Fresh"
      : status === "stale"
        ? "Stale"
        : status === "unavailable"
          ? "Unavailable"
          : "Unknown";
  return (
    <Badge variant={status === "stale" ? "destructive" : "outline"}>
      {label}: {text}
    </Badge>
  );
}

function AstronomyMoonDetails({
  astronomy,
  timezone,
  timeFormat,
}: Pick<
  AstronomyPresetProps,
  "astronomy" | "timezone" | "timeFormat"
>): React.ReactElement {
  const moon = astronomyGroupData(astronomy?.groups.moon);
  const progress = moon
    ? clampSynodicProgress(moon.synodicProgress * 100)
    : null;
  const items: Array<[string, string]> = moon
    ? [
        ["Phase angle", formatDegrees(moon.phaseAngle) ?? "Unavailable"],
        ["Trend", moon.trend === "waxing" ? "Waxing" : "Waning"],
        [
          "Synodic progress",
          progress == null
            ? "Unavailable"
            : `${progress.toFixed(1)}% · Near ${nearestSynodicMilestone(progress)}`,
        ],
        [
          "Libration latitude",
          formatDegrees(moon.librationLatitude) ?? "Unavailable",
        ],
        [
          "Libration longitude",
          formatDegrees(moon.librationLongitude) ?? "Unavailable",
        ],
        [
          "Next primary phase",
          moon.nextPrimaryPhaseName
            ? `${moonPhaseDisplayName(moon.nextPrimaryPhaseName)} · ${formatAstronomyDateTime(moon.nextPrimaryPhaseTime, timezone, timeFormat)}`
            : "Unavailable",
        ],
        [
          "Next perigee",
          formatAstronomyDateTime(moon.nextPerigeeTime, timezone, timeFormat),
        ],
        [
          "Next apogee",
          formatAstronomyDateTime(moon.nextApogeeTime, timezone, timeFormat),
        ],
      ]
    : [];

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Moon details
        </h3>
        <GroupStatusLabel label="Moon" status={astronomy?.groups.moon.status} />
      </div>
      {moon ? (
        <dl className="grid min-w-0 grid-cols-1 gap-2 rounded-md border bg-card p-3 @min-[32rem]/details:grid-cols-2 @min-[64rem]/details:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="break-words text-xs font-medium tabular-nums">
                {value}
              </dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">Distance</dt>
            <dd className="break-words text-xs font-medium tabular-nums">
              {formatKilometers(moon.distanceKm) ?? "Unavailable"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          Moon data is unavailable.
        </p>
      )}
    </section>
  );
}

function AstronomyAllGlobalEvents({
  events,
  status,
  timezone,
  timeFormat,
}: Pick<AstronomyPresetProps, "timezone" | "timeFormat"> & {
  events: AstronomyGlobalEvent[] | null;
  status: string | undefined;
}): React.ReactElement {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Global events
        </h3>
        <GroupStatusLabel label="Global events" status={status} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Event times are shown in the selected location&apos;s timezone. These
        events are global and do not indicate local visibility.
      </p>
      {events == null ? (
        <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          Global event data is unavailable.
        </p>
      ) : events.length > 0 ? (
        <AstronomyEventList
          dateFirst
          events={events}
          timezone={timezone}
          timeFormat={timeFormat}
        />
      ) : (
        <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
          No global events were returned.
        </p>
      )}
    </section>
  );
}

export function AstronomyPositions({
  horizon,
}: {
  horizon: AstronomyHorizonData | null;
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
    <section className="@container flex min-w-0 flex-col">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sun &amp; Moon positions
      </h3>
      <div className="grid min-w-0 flex-1 grid-cols-2 content-start gap-3 rounded-md border bg-muted/30 p-3">
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
        <div className="relative col-span-full mt-1 h-20" aria-hidden="true">
          <div className="absolute inset-x-0 top-1/2 border-t border-muted-foreground" />
          <div className="absolute bottom-0 left-1/4 top-0 border-l border-dashed border-border" />
          <div className="absolute bottom-0 left-3/4 top-0 border-l border-dashed border-border" />
          {bodies.map(({ name, altitude }, index) => {
            const gauge = altitudeGaugePercent(altitude);
            const isSun = name === "Sun";
            const BodyIcon = isSun ? Sun : Moon;
            return gauge == null ? null : (
              <span
                key={name}
                className="absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-card text-primary"
                style={{
                  left: index === 0 ? "25%" : "75%",
                  top: `${100 - gauge}%`,
                }}
              >
                <BodyIcon
                  aria-hidden="true"
                  className="h-4 w-4"
                  strokeWidth={2.25}
                />
              </span>
            );
          })}
        </div>
        <div
          className="col-span-full grid grid-cols-2 text-center text-xs font-medium text-muted-foreground"
          aria-hidden="true"
        >
          <span>Sun</span>
          <span>Moon</span>
        </div>
        <p
          className="col-span-full text-center text-xs font-medium text-foreground"
          aria-hidden="true"
        >
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
  includeOtherBodies = false,
  includeExtendedData = false,
}: {
  planets: AstronomyPlanetData[] | null;
  timezone: string | null;
  timeFormat: AstronomyTimeFormat;
  includeOtherBodies?: boolean;
  includeExtendedData?: boolean;
}): React.ReactElement {
  // Twelve tracks balance the seven canonical cards into quarters, then thirds.
  // At wider widths each card instead occupies one of seven equal columns.
  return (
    <>
      {planetsInCanonicalOrder(planets, includeOtherBodies).map(
        ({ body, entry }, index) => {
          if (!entry && includeOtherBodies) return null;
          const direction = compassDirection(entry?.azimuth);
          return (
            <article
              key={body}
              aria-label={`${body} observing information`}
              className={cn(
                "min-w-0 rounded-md border bg-card p-3",
                index === 6
                  ? "@min-[26rem]/planets:col-span-12"
                  : "@min-[26rem]/planets:col-span-6",
                index < 4
                  ? "@min-[48rem]/planets:col-span-3"
                  : "@min-[48rem]/planets:col-span-4",
                "@min-[87rem]/planets:col-span-1",
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PlanetGlyph body={body} />
                <div className="min-w-0 space-y-1">
                  <h4 className="text-sm font-semibold">{body}</h4>
                  <Badge
                    variant="outline"
                    className="max-w-full px-2 text-[10px]"
                  >
                    {entry ? planetDisplayState(entry) : "Unknown"}
                  </Badge>
                </div>
              </div>
              <div className="my-3 min-w-0 rounded-md bg-muted/30 p-2">
                <p className="text-xs font-semibold tabular-nums">
                  {formatAltitudePosition(entry?.altitude)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {direction
                    ? `${direction} · ${formatDegrees(entry?.azimuth)}`
                    : "Direction unavailable"}
                </p>
              </div>
              <dl className="space-y-1 text-[11px]">
                <div className="flex flex-wrap justify-between gap-x-2">
                  <dt className="text-muted-foreground">Brightness (mag)</dt>
                  <dd className="tabular-nums">
                    {formatMagnitudeValue(entry?.magnitude) ?? "Unavailable"}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-2">
                  <dt className="text-muted-foreground">Rise</dt>
                  <dd className="tabular-nums">
                    {formatAstronomyTime(entry?.riseTime, timezone, timeFormat)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-x-2">
                  <dt className="text-muted-foreground">Set</dt>
                  <dd className="tabular-nums">
                    {formatAstronomyTime(entry?.setTime, timezone, timeFormat)}
                  </dd>
                </div>
                {includeExtendedData && (
                  <>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">Illumination</dt>
                      <dd className="tabular-nums">
                        {entry?.illuminationPercent == null
                          ? "Unavailable"
                          : `${entry.illuminationPercent}%`}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">Phase angle</dt>
                      <dd className="tabular-nums">
                        {formatDegrees(entry?.phaseAngle) ?? "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">
                        Heliocentric distance
                      </dt>
                      <dd className="tabular-nums">
                        {formatAstronomicalUnits(
                          entry?.heliocentricDistanceAu,
                        ) ?? "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">
                        Geocentric distance
                      </dt>
                      <dd className="tabular-nums">
                        {formatAstronomicalUnits(entry?.geocentricDistanceAu) ??
                          "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">
                        Ecliptic longitude
                      </dt>
                      <dd className="tabular-nums">
                        {formatDegrees(entry?.eclipticLongitude) ??
                          "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-2">
                      <dt className="text-muted-foreground">
                        Ecliptic latitude
                      </dt>
                      <dd className="tabular-nums">
                        {formatDegrees(entry?.eclipticLatitude) ??
                          "Unavailable"}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </article>
          );
        },
      )}
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
    <div className="h-full min-h-0 w-full flex-1 overflow-hidden rounded-md border bg-card">
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
              className={cn(
                "border-b last:border-b-0 even:bg-muted/30",
                compact && "h-1/4",
              )}
            >
              <td className={cn("px-2", compact ? "py-2.5" : "py-2")}>
                <span className="flex items-center gap-1.5">
                  <HorizonEventIcon
                    body={body}
                    direction={direction}
                    themeColors
                  />
                  {label}
                </span>
              </td>
              <td
                className={cn(
                  "px-3 font-semibold tabular-nums",
                  compact ? "py-2.5" : "py-2",
                )}
              >
                {formatAstronomyTime(time, timezone, timeFormat)}
              </td>
              <td
                className={cn(
                  "px-2 text-muted-foreground",
                  compact ? "py-2.5" : "py-2",
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
