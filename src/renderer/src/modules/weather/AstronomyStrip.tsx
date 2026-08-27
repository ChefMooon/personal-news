import React, { useEffect, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type {
  AstronomySnapshot,
  WeatherSettings,
} from "../../../../shared/ipc-types";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import {
  countdownLabel,
  formatHorizonTime,
  formatNextPhaseDateTime,
  moonPhaseDisplayName,
  nextPrimaryPhaseMilestone,
  solarStateLabel,
} from "./astronomy-display";

function useNowMilliseconds(active: boolean, intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

/**
 * Local vector moon glyph. The illuminated shape follows the normalized phase
 * angle; geometry is decorative while the wrapper carries an accessible name
 * describing the phase and illumination state.
 */
export function MoonPhaseGlyph({
  phaseAngle,
  illuminationPercent,
  label,
  size = 40,
}: {
  phaseAngle: number | null;
  illuminationPercent?: number | null;
  label: string;
  size?: number;
}): React.ReactElement {
  let litPath: string | null = null;
  if (phaseAngle != null && Number.isFinite(phaseAngle)) {
    const theta = ((phaseAngle % 360) + 360) % 360;
    const waxing = theta < 180;
    // Use the same illumination value shown beside the glyph when available.
    // The phase angle remains the source for which side is waxing/waning.
    const illumination =
      illuminationPercent != null && Number.isFinite(illuminationPercent)
        ? Math.max(0, Math.min(100, illuminationPercent)) / 100
        : (1 - Math.cos((theta * Math.PI) / 180)) / 2;
    const e = 1 - 2 * illumination;
    const r = 18;
    const cx = 20;
    const cy = 20;
    const rx = Math.abs(e) * r;
    const limbSweep = waxing ? 1 : 0;
    const terminatorSweep = e >= 0 ? 0 : 1;
    litPath = [
      `M ${cx} ${cy - r}`,
      `A ${r} ${r} 0 0 ${limbSweep} ${cx} ${cy + r}`,
      `A ${rx.toFixed(2)} ${r} 0 0 ${terminatorSweep} ${cx} ${cy - r}`,
      "Z",
    ].join(" ");
  }

  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex shrink-0"
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" className="h-full w-full" viewBox="0 0 40 40">
        <circle
          cx={20}
          cy={20}
          r={19}
          className="fill-none stroke-slate-400/35 drop-shadow-[0_0_2px_rgba(148,163,184,0.35)] dark:stroke-slate-500/45"
          strokeWidth="1"
        />
        <circle
          cx={20}
          cy={20}
          r={18}
          className="fill-muted/20 stroke-slate-500 dark:stroke-slate-400"
          strokeWidth="1"
        />
        {litPath && <path d={litPath} className="fill-amber-300" />}
        {!litPath && (
          <text
            x={20}
            y={24}
            textAnchor="middle"
            fontSize="14"
            className="fill-muted-foreground"
          >
            ?
          </text>
        )}
      </svg>
    </span>
  );
}

export function SunGlyph(): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7 shrink-0 text-amber-300"
      viewBox="0 0 40 40"
      fill="none"
    >
      <circle cx="20" cy="20" r="7" className="fill-current" />
      <path
        d="M20 3 V9 M20 31 V37 M3 20 H9 M31 20 H37 M8 8 L12 12 M28 28 L32 32 M32 8 L28 12 M12 28 L8 32"
        className="stroke-current"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HorizonEventIcon({
  body,
  direction,
}: {
  body: "sun" | "moon";
  direction: "rise" | "set";
}): React.ReactElement {
  const arrowY = direction === "rise" ? 9 : 31;
  const arcPath =
    direction === "rise"
      ? "M 7 25 A 13 13 0 0 1 33 25"
      : "M 7 15 A 13 13 0 0 0 33 15";
  const arrowPath =
    direction === "rise"
      ? "M 20 30 V 17 M 15 22 L 20 17 L 25 22"
      : "M 20 10 V 23 M 15 18 L 20 23 L 25 18";

  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
      viewBox="0 0 40 40"
      fill="none"
    >
      <path
        d={arcPath}
        className="stroke-current"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {body === "sun" ? (
        <circle
          cx="20"
          cy={arrowY}
          r="4"
          className="fill-amber-300 stroke-current"
          strokeWidth="1.5"
        />
      ) : (
        <path
          d="M 23 5 A 7 7 0 1 0 29 16 A 6 6 0 0 1 23 5 Z"
          className="fill-muted stroke-current"
          strokeWidth="1.5"
        />
      )}
      <path
        d={arrowPath}
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HorizonRow({
  label,
  time,
  body,
  direction,
}: {
  label: string;
  time: string | null;
  body: "sun" | "moon";
  direction: "rise" | "set";
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <HorizonEventIcon body={body} direction={direction} />
        <span>{label}</span>
      </span>
      <span
        className={cn(
          "text-xs font-semibold tabular-nums",
          time == null && "font-normal text-muted-foreground",
        )}
      >
        {time ?? "Unavailable"}
      </span>
    </div>
  );
}

function MoonCard({
  astronomy,
  horizon,
  timezone,
  settings,
}: {
  astronomy: AstronomySnapshot | null;
  horizon: AstronomySnapshot["groups"]["horizon"]["data"] | null;
  timezone: string;
  settings: WeatherSettings;
}): React.ReactElement {
  const moon =
    astronomy?.groups.moon.status === "unavailable"
      ? null
      : (astronomy?.groups.moon.data ?? null);

  if (!moon) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <MoonPhaseGlyph
            phaseAngle={null}
            illuminationPercent={null}
            label="Moon phase unavailable"
            size={36}
          />
          <div className="min-w-0 space-y-1">
            <h4 className="text-xs font-semibold">Moon</h4>
            <p className="truncate text-[11px] text-muted-foreground">
              Moon data unavailable
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <HorizonRow
            label="Moonrise"
            body="moon"
            direction="rise"
            time={formatHorizonTime(
              horizon?.moon.riseTime,
              timezone,
              settings.timeFormat,
            )}
          />
          <HorizonRow
            label="Moonset"
            body="moon"
            direction="set"
            time={formatHorizonTime(
              horizon?.moon.setTime,
              timezone,
              settings.timeFormat,
            )}
          />
        </div>
      </div>
    );
  }

  const trendLabel = moon.trend === "waxing" ? "Waxing" : "Waning";
  const TrendIcon = moon.trend === "waxing" ? TrendingUp : TrendingDown;
  const glyphLabel = `${moonPhaseDisplayName(moon.phaseName)}, ${Math.round(
    moon.illuminationPercent,
  )}% illuminated`;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <MoonPhaseGlyph
          phaseAngle={moon.phaseAngle}
          illuminationPercent={moon.illuminationPercent}
          label={glyphLabel}
          size={36}
        />
        <div className="min-w-0 space-y-1">
          <h4 className="text-xs font-semibold">Moon</h4>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <TrendIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {Math.round(moon.illuminationPercent)}% illuminated · {trendLabel}
            </span>
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <HorizonRow
          label="Moonrise"
          body="moon"
          direction="rise"
          time={formatHorizonTime(
            horizon?.moon.riseTime,
            timezone,
            settings.timeFormat,
          )}
        />
        <HorizonRow
          label="Moonset"
          body="moon"
          direction="set"
          time={formatHorizonTime(
            horizon?.moon.setTime,
            timezone,
            settings.timeFormat,
          )}
        />
      </div>
    </div>
  );
}

function HorizonCard({
  horizon,
  timezone,
  settings,
}: {
  horizon: AstronomySnapshot["groups"]["horizon"]["data"] | null;
  timezone: string;
  settings: WeatherSettings;
}): React.ReactElement {
  return (
    <div className="min-w-0 space-y-1.5">
      <h4 className="flex items-center gap-2 text-xs font-semibold">
        <SunGlyph />
        <span>Sun</span>
      </h4>
      {horizon ? (
        <>
          <HorizonRow
            label="Sunrise"
            body="sun"
            direction="rise"
            time={formatHorizonTime(
              horizon.sun.riseTime,
              timezone,
              settings.timeFormat,
            )}
          />
          <HorizonRow
            label="Sunset"
            body="sun"
            direction="set"
            time={formatHorizonTime(
              horizon.sun.setTime,
              timezone,
              settings.timeFormat,
            )}
          />
        </>
      ) : (
        <>
          <HorizonRow label="Sunrise" body="sun" direction="rise" time={null} />
          <HorizonRow label="Sunset" body="sun" direction="set" time={null} />
        </>
      )}
    </div>
  );
}

function NextPhaseCard({
  astronomy,
  timezone,
  settings,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string;
  settings: WeatherSettings;
}): React.ReactElement {
  const milestone = nextPrimaryPhaseMilestone(astronomy);
  const nowSeconds = Math.floor(useNowMilliseconds(milestone != null) / 1000);

  return (
    <div className="min-w-0 space-y-1.5">
      <h4 className="text-xs font-semibold">Next phase</h4>
      {milestone ? (
        <>
          <p className="truncate text-xs font-medium">
            {moonPhaseDisplayName(milestone.name)}
          </p>
          <p className="text-xs font-semibold text-foreground">
            {countdownLabel(milestone.time, nowSeconds)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatNextPhaseDateTime(
              milestone.time,
              timezone,
              settings.timeFormat,
            ) ?? "Unavailable"}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Next phase unavailable
        </p>
      )}
    </div>
  );
}

/**
 * Three-card astronomy strip rendered inside the Weather widget when both the
 * app-level Astronomy feature and the instance `showAstronomy` setting are on.
 * Missing or partial snapshot data renders stable placeholders without hiding
 * the valid Weather content around it.
 */
export function AstronomyStrip({
  astronomy,
  timezone,
  settings,
  contentWidth,
}: {
  astronomy: AstronomySnapshot | null;
  timezone: string;
  settings: WeatherSettings;
  contentWidth: number;
}): React.ReactElement {
  const horizon =
    astronomy?.groups.horizon.status === "unavailable"
      ? null
      : (astronomy?.groups.horizon.data ?? null);

  return (
    <section
      aria-label="Astronomy"
      className="w-fit max-w-full rounded-md border px-3 py-2.5"
    >
      <div className="w-full max-w-[760px]" style={{ width: contentWidth }}>
        <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Astronomy
          </h3>
          <Badge variant="secondary" className="max-w-full">
            <span className="truncate">
              {horizon ? solarStateLabel(horizon.solarState) : "Unavailable"}
            </span>
          </Badge>
        </div>
        <div className="grid min-h-[76px] grid-cols-1 items-center gap-y-3 sm:grid-cols-3 sm:gap-x-0 sm:divide-x sm:divide-border [&>*]:sm:px-4 [&>*]:sm:first:pl-0 [&>*]:sm:last:pr-0">
          <HorizonCard
            horizon={horizon}
            timezone={timezone}
            settings={settings}
          />
          <MoonCard
            astronomy={astronomy}
            horizon={horizon}
            timezone={timezone}
            settings={settings}
          />
          <NextPhaseCard
            astronomy={astronomy}
            timezone={timezone}
            settings={settings}
          />
        </div>
      </div>
    </section>
  );
}
