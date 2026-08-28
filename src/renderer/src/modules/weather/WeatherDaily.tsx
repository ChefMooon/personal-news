import React from "react";
import type {
  WeatherDailyPoint,
  WeatherSettings,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { formatCompactNumber, formatTemp, weatherIcon } from "./WeatherSummary";
export function WeatherDaily({
  points,
  yesterday,
  config,
  settings,
  cap,
}: {
  points: WeatherDailyPoint[];
  yesterday: WeatherDailyPoint | null;
  config: WeatherViewConfig;
  settings: WeatherSettings;
  cap: number;
}): React.ReactElement {
  const visible = [
    ...(config.showYesterday && yesterday
      ? [{ point: yesterday, label: "Yesterday", muted: true, isToday: false }]
      : []),
    ...points.slice(0, cap).map((point, index) => ({
      point,
      label:
        index === 0
          ? "Today"
          : new Date(`${point.date}T12:00:00`).toLocaleDateString([], {
              weekday: "short",
            }),
      muted: false,
      isToday: index === 0,
    })),
  ];
  if (!visible.length)
    return (
      <p className="text-xs text-muted-foreground">
        No daily forecast available.
      </p>
    );
  return (
    <section
      aria-label="Daily forecast"
      className="weather-timeline-scroll min-w-0 overflow-x-auto"
    >
      <div className="flex w-full gap-2 pb-0.5">
        {visible.map(({ point, label, muted, isToday }) => (
          <div
            key={`${point.date}:${label}`}
            className={cn(
              "flex min-w-[92px] flex-1 flex-col gap-2 rounded-md px-3 py-2",
              isToday
                ? "border border-primary/40 bg-primary/10"
                : "bg-muted/20",
              muted && "opacity-70",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-[10px] font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {label}
              </span>
              {config.showPrecipitation && (
                <span className="text-[9px] text-sky-400">
                  {formatCompactNumber(point.precipitationProbabilityMax, "%")}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>{weatherIcon(point.weatherCode, true)}</div>
              <div className="text-right leading-tight">
                <p className="text-sm font-bold">
                  {formatTemp(point.tempMax, settings)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatTemp(point.tempMin, settings)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
