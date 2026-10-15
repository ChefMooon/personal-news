import React from "react";
import { Badge } from "../../components/ui/badge";
import {
  astronomyGroupData,
  formatAstronomyDateTime,
  formatAstronomyTime,
  type AstronomyPresetProps,
  type AstronomyTimeFormat,
} from "./AstronomyPrimitives";
import {
  formatKilometers,
  moonPhaseDisplayName,
  nextPrimaryPhaseMilestone,
  solarStateLabel,
} from "./astronomy-display";
import {
  HorizonEventIcon,
  MoonPhaseGlyph,
  SunGlyph,
} from "../weather/AstronomyStrip";

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
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <HorizonEventIcon body={body} direction={direction} themeColors />
        <span>{label}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">
        {formatAstronomyTime(time, timezone, timeFormat)}
      </span>
    </div>
  );
}

export function AstronomySmall({
  astronomy,
  timezone,
  timeFormat,
}: AstronomyPresetProps): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const moon = astronomyGroupData(astronomy?.groups.moon);
  const milestone = nextPrimaryPhaseMilestone(astronomy);

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <section className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3">
        <h3 className="flex h-10 items-center gap-2 text-xs font-semibold">
          <SunGlyph themeColors />
          Sun
        </h3>
        <div className="flex h-5 items-center">
          <Badge
            variant="secondary"
            className="max-w-full px-2 py-0 text-[10px]"
          >
            <span className="truncate">
              {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
            </span>
          </Badge>
        </div>
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

      <section className="min-w-0 space-y-2 rounded-md border bg-muted/30 p-3">
        <div className="flex h-10 min-w-0 items-center gap-3">
          <MoonPhaseGlyph
            themeColors
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
        <div className="flex min-h-5 flex-wrap items-center justify-between gap-x-2 text-[10px] text-muted-foreground">
          <span>
            {moon ? moonPhaseDisplayName(moon.phaseName) : "Unavailable"}
          </span>
          <span className="tabular-nums">
            Distance: {formatKilometers(moon?.distanceKm) ?? "Unavailable"}
          </span>
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

      <section className="col-span-full flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t pt-3">
        <div className="min-w-0">
          <h3 className="text-[11px] text-muted-foreground">Next phase</h3>
          <p className="text-xs font-semibold">
            {milestone?.name
              ? moonPhaseDisplayName(milestone.name)
              : "Unavailable"}
          </p>
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {milestone
            ? formatAstronomyDateTime(milestone.time, timezone, timeFormat)
            : "Next phase unavailable"}
        </p>
      </section>
    </div>
  );
}

export default AstronomySmall;
