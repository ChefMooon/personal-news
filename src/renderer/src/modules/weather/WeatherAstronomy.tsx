import React from "react";
import { MoonStar } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  AstronomySnapshot,
  WeatherSettings,
} from "../../../../shared/ipc-types";
import { AstronomyStrip } from "./AstronomyStrip";

export function WeatherAstronomyDetailsLink({
  locationId,
}: {
  locationId: string;
}): React.ReactElement {
  return (
    <Link
      to={`/astronomy/details?locationId=${encodeURIComponent(locationId)}`}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Astronomy"
      title="Astronomy"
    >
      <MoonStar aria-hidden="true" className="h-4 w-4" />
    </Link>
  );
}

export function WeatherAstronomy({
  astronomy,
  timezone,
  settings,
  variant = "row",
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string;
  settings: WeatherSettings;
  variant?: "strip" | "medium-compact" | "stacked" | "row";
}): React.ReactElement {
  return (
    <div className={variant === "stacked" ? "h-full min-w-0" : "min-w-0"}>
      <AstronomyStrip
        astronomy={astronomy}
        timezone={timezone}
        settings={settings}
        contentWidth={variant === "stacked" ? 240 : 720}
        stacked={variant === "stacked"}
        compact={variant === "strip" || variant === "medium-compact"}
        includeMoonTimes={variant === "medium-compact"}
      />
    </div>
  );
}
