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
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <HorizonEventIcon body={body} direction={direction} />
        <span>{label}</span>
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums">
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
              ? formatAstronomyDateTime(milestone.time, timezone, timeFormat)
              : "Next phase unavailable"}
          </p>
        </section>
      </div>
    </div>
  );
}

export default AstronomySmall;
