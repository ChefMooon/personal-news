import React from "react";
import {
  AstronomyDetailedPrimitives,
  AstronomySummaryPrimitives,
  type AstronomyPresetProps,
} from "./AstronomyPrimitives";

export function AstronomyLarge({
  astronomy,
  timezone,
  timeFormat,
  nowSeconds,
  detailed,
}: AstronomyPresetProps & { detailed: boolean }): React.ReactElement {
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

export default AstronomyLarge;
