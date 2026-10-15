import React from "react";
import {
  AstronomyUpcomingEvents,
  AstronomyPositions,
  AstronomySummaryPrimitives,
  Timetable,
  astronomyGroupData,
  type AstronomyPresetProps,
} from "./AstronomyPrimitives";
import { upcomingGlobalEvents } from "./astronomy-display";

export function AstronomyMedium({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  eventLimit = 5,
  stacked = false,
}: AstronomyPresetProps & {
  eventLimit?: number;
  stacked?: boolean;
}): React.ReactElement {
  const horizon = astronomyGroupData(astronomy?.groups.horizon);
  const events = upcomingGlobalEvents(
    astronomyGroupData(astronomy?.groups.events),
    nowSeconds,
  ).slice(0, eventLimit);

  return (
    <div className="min-w-0 space-y-4">
      <AstronomySummaryPrimitives
        astronomy={astronomy}
        timezone={timezone}
        timeFormat={timeFormat}
        nowSeconds={nowSeconds}
        eventLimit={0}
        showSunAltitude={false}
        showNextRiseSet={false}
      />
      <div
        className={`grid min-w-0 gap-3 ${stacked ? "grid-cols-1" : "grid-cols-2"}`}
      >
        <AstronomyPositions horizon={horizon} />
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
      <AstronomyUpcomingEvents
        events={events}
        timezone={timezone}
        timeFormat={timeFormat}
      />
    </div>
  );
}

export default AstronomyMedium;
