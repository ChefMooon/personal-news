import React from "react";
import type {
  AstronomySnapshot,
  WeatherSettings,
} from "../../../../shared/ipc-types";
import { AstronomyStrip } from "./AstronomyStrip";

export function WeatherAstronomy({
  astronomy,
  timezone,
  settings,
  variant = "row",
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string;
  settings: WeatherSettings;
  variant?: "strip" | "stacked" | "row";
}): React.ReactElement {
  return (
    <div className={variant === "stacked" ? "h-full min-w-0" : "min-w-0"}>
      <AstronomyStrip
        astronomy={astronomy}
        timezone={timezone}
        settings={settings}
        contentWidth={variant === "stacked" ? 240 : 720}
        stacked={variant === "stacked"}
        compact={variant === "strip"}
      />
    </div>
  );
}
