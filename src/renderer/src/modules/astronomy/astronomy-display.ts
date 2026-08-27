import type {
  AstronomyEventFamily,
  AstronomyGlobalEvent,
  AstronomyHorizonData,
  AstronomyPlanetData,
  WeatherSettings,
} from "../../../../shared/ipc-types";

// Generic astronomy presentation helpers are shared with the Weather strip so
// both renderer surfaces use one implementation.
import { formatNextPhaseDateTime } from "../weather/astronomy-display";

export {
  countdownLabel,
  formatHorizonTime,
  formatNextPhaseDateTime,
  moonPhaseDisplayName,
  nextPrimaryPhaseMilestone,
  solarStateLabel,
} from "../weather/astronomy-display";

type TimeFormat = WeatherSettings["timeFormat"];

/** Maximum number of events shown in the compact summary list. */
export const SUMMARY_EVENT_LIMIT = 5;

/** Altitude below which an up-planet is labeled "Near horizon" (degrees). */
const NEAR_HORIZON_ALTITUDE_DEG = 10;

const EVENT_FAMILY_LABELS: Record<AstronomyEventFamily, string> = {
  season: "Season",
  lunar_eclipse: "Lunar eclipse",
  solar_eclipse: "Solar eclipse",
  transit: "Transit",
};

export function eventFamilyLabel(
  family: AstronomyEventFamily | null | undefined,
): string {
  return family ? EVENT_FAMILY_LABELS[family] : "Unavailable";
}

/**
 * Factual geometry state for one planet entry, derived only from backend
 * fields. Never claims real-world visibility or viewing suitability.
 */
export type PlanetDisplayState =
  | "Daylight"
  | "Below horizon"
  | "Near horizon"
  | "Potentially visible"
  | "Unknown";

export function planetDisplayState(
  planet: Pick<AstronomyPlanetData, "skyState" | "altitude">,
): PlanetDisplayState {
  if (planet.skyState === "below_horizon") {
    return "Below horizon";
  }
  if (planet.skyState === "too_bright") {
    return "Daylight";
  }
  if (planet.skyState === "up") {
    const altitude = planet.altitude;
    return altitude != null &&
      Number.isFinite(altitude) &&
      altitude < NEAR_HORIZON_ALTITUDE_DEG
      ? "Near horizon"
      : "Potentially visible";
  }
  return "Unknown";
}

/** Canonical planet order for the detailed grid; missing entries stay listed. */
export const CANONICAL_PLANET_ORDER = [
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
] as const;

export function planetsInCanonicalOrder(
  data: AstronomyPlanetData[] | null | undefined,
): Array<{ body: string; entry: AstronomyPlanetData | null }> {
  const byBody = new Map((data ?? []).map((entry) => [entry.body, entry]));
  return CANONICAL_PLANET_ORDER.map((body) => ({
    body,
    entry: byBody.get(body) ?? null,
  }));
}

/**
 * Chronologically sorted upcoming global events. Events at or before the
 * current clock are omitted; the caller decides any further bound.
 */
export function upcomingGlobalEvents(
  events: AstronomyGlobalEvent[] | null | undefined,
  nowUnixSeconds: number,
): AstronomyGlobalEvent[] {
  if (!Array.isArray(events)) {
    return [];
  }
  const floorNow = Math.floor(nowUnixSeconds);
  return events
    .filter(
      (event) =>
        event != null &&
        Number.isFinite(event.time) &&
        Math.floor(event.time) >= floorNow,
    )
    .sort((a, b) => a.time - b.time);
}

const SYNODIC_MILESTONES = [
  { percent: 0, label: "New Moon" },
  { percent: 25, label: "First Quarter" },
  { percent: 50, label: "Full Moon" },
  { percent: 75, label: "Third Quarter" },
] as const;

/** Clamp a synodic progress value into the stable 0-100 indicator range. */
export function clampSynodicProgress(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.min(100, value));
}

/** Nearest of the four primary milestones on the circular synodic cycle. */
export function nearestSynodicMilestone(
  progressPercent: number | null | undefined,
): string {
  const clamped = clampSynodicProgress(progressPercent);
  if (clamped == null) {
    return "Unavailable";
  }
  let best: { percent: number; label: string } = SYNODIC_MILESTONES[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const milestone of SYNODIC_MILESTONES) {
    const raw = Math.abs(clamped - milestone.percent);
    // The cycle wraps: progress near 100 is also near New Moon at 0/100.
    const distance = Math.min(raw, 100 - raw);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = milestone;
    }
  }
  return best.label;
}

/** Whole-degree altitude/azimuth text, e.g. "23°". */
export function formatDegrees(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value)}°`;
}

/** Thousands-grouped kilometers text, e.g. "384,400 km". */
export function formatKilometers(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  try {
    return `${Math.round(value).toLocaleString([], {
      maximumFractionDigits: 0,
    })} km`;
  } catch {
    return null;
  }
}

/** Astronomical-unit distance text, e.g. "1.52 AU". */
export function formatAstronomicalUnits(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return `${value.toFixed(2)} AU`;
}

/** Apparent magnitude text preserving sign, e.g. "-2.1". */
export function formatMagnitudeValue(
  value: number | null | undefined,
): string | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value.toFixed(1);
}

export interface RiseSetItem {
  label: string;
  time: number;
}

/**
 * The nearest future rise/set event among Sun and Moon local-day times.
 * Returns null when every provided time has already passed or none exist;
 * nulls never become claims of absence beyond that factual statement.
 */
export function nextRiseSetItem(
  horizon: AstronomyHorizonData | null,
  nowUnixSeconds: number,
): RiseSetItem | null {
  if (!horizon) {
    return null;
  }
  const candidates: RiseSetItem[] = [];
  const push = (label: string, time: number | null): void => {
    if (time != null && Number.isFinite(time)) {
      candidates.push({ label, time });
    }
  };
  push("Sunrise", horizon.sun.riseTime);
  push("Sunset", horizon.sun.setTime);
  push("Moonrise", horizon.moon.riseTime);
  push("Moonset", horizon.moon.setTime);

  const floorNow = Math.floor(nowUnixSeconds);
  let best: RiseSetItem | null = null;
  for (const candidate of candidates) {
    if (candidate.time < floorNow) {
      continue;
    }
    if (best == null || candidate.time < best.time) {
      best = candidate;
    }
  }
  return best;
}

/** Factual above/below-horizon wording for a body altitude value. */
export function horizonGeometryState(
  altitude: number | null | undefined,
): string {
  if (altitude == null || !Number.isFinite(altitude)) {
    return "Unavailable";
  }
  return altitude > 0 ? "Above horizon" : "Below horizon";
}

export interface SkyArcPosition {
  xPercent: number;
  yPercent: number;
}

/**
 * Rectangular sky plot position for a body: azimuth maps east (90°) to the
 * left edge and west (270°) to the right edge with clamping outside that
 * range; altitude maps 0° (horizon) to the bottom and 90° (zenith) to the top.
 */
export function skyArcPosition(
  altitudeDeg: number | null | undefined,
  azimuthDeg: number | null | undefined,
): SkyArcPosition | null {
  if (
    altitudeDeg == null ||
    !Number.isFinite(altitudeDeg) ||
    azimuthDeg == null ||
    !Number.isFinite(azimuthDeg)
  ) {
    return null;
  }
  const wrapped = ((azimuthDeg % 360) + 360) % 360;
  const xFraction = Math.max(0, Math.min(1, (wrapped - 90) / 180));
  const clampedAltitude = Math.max(0, Math.min(90, altitudeDeg));
  return {
    xPercent: xFraction * 100,
    yPercent: (1 - clampedAltitude / 90) * 100,
  };
}

/** Localized "calculated at" stamp in the selected location timezone. */
export function formatCalculatedAt(
  unixSeconds: number | null | undefined,
  timeZone: string | null,
  timeFormat: TimeFormat,
): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds) || !timeZone) {
    return null;
  }
  return formatNextPhaseDateTime(unixSeconds, timeZone, timeFormat);
}
