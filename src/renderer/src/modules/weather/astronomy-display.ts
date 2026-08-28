import type {
  AstronomyMoonPhaseName,
  AstronomySnapshot,
  AstronomySolarState,
  WeatherSettings,
} from "../../../../shared/ipc-types";

const MOON_PHASE_LABELS: Record<AstronomyMoonPhaseName, string> = {
  new: "New Moon",
  waxing_crescent: "Waxing Crescent",
  first_quarter: "First Quarter",
  waxing_gibbous: "Waxing Gibbous",
  full: "Full Moon",
  waning_gibbous: "Waning Gibbous",
  last_quarter: "Third Quarter",
  waning_crescent: "Waning Crescent",
};

export function moonPhaseDisplayName(
  phaseName: AstronomyMoonPhaseName | null | undefined,
): string {
  return phaseName ? MOON_PHASE_LABELS[phaseName] : "Unavailable";
}

const SOLAR_STATE_LABELS: Record<AstronomySolarState["state"], string> = {
  day: "Daylight",
  civil_twilight: "Civil Twilight",
  nautical_twilight: "Nautical Twilight",
  astronomical_twilight: "Astronomical Twilight",
  night: "Astronomical Night",
};

export function solarStateLabel(
  state: AstronomySolarState["state"] | null | undefined,
): string {
  return state ? SOLAR_STATE_LABELS[state] : "Unavailable";
}

function hour12For(
  timeFormat: WeatherSettings["timeFormat"],
): boolean | undefined {
  return timeFormat === "system" ? undefined : timeFormat === "12h";
}

/** Clock time for a Unix-seconds timestamp rendered in the given IANA timezone. */
export function formatHorizonTime(
  unixSeconds: number | null | undefined,
  timeZone: string,
  timeFormat: WeatherSettings["timeFormat"],
): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) {
    return null;
  }
  try {
    return new Date(unixSeconds * 1000).toLocaleTimeString([], {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: hour12For(timeFormat),
    });
  } catch {
    return null;
  }
}

/** Localized date and time for a Unix-seconds timestamp in the given IANA timezone. */
export function formatNextPhaseDateTime(
  unixSeconds: number | null | undefined,
  timeZone: string,
  timeFormat: WeatherSettings["timeFormat"],
): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds)) {
    return null;
  }
  try {
    return new Date(unixSeconds * 1000).toLocaleString([], {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: hour12For(timeFormat),
    });
  } catch {
    return null;
  }
}

/** Localized calculated-at timestamp for an astronomy snapshot. */
export function formatCalculatedAt(
  unixSeconds: number | null | undefined,
  timeZone: string | null,
  timeFormat: WeatherSettings["timeFormat"],
): string | null {
  if (unixSeconds == null || !Number.isFinite(unixSeconds) || !timeZone) {
    return null;
  }
  return formatNextPhaseDateTime(unixSeconds, timeZone, timeFormat);
}

/**
 * Relative countdown wording at minute/hour/day boundaries, derived from the
 * current clock so it never freezes at fetch time.
 */
export function countdownLabel(
  eventUnixSeconds: number | null | undefined,
  nowUnixSeconds: number,
): string {
  if (
    eventUnixSeconds == null ||
    !Number.isFinite(eventUnixSeconds) ||
    !Number.isFinite(nowUnixSeconds)
  ) {
    return "Unavailable";
  }
  const diffSeconds = Math.floor(eventUnixSeconds) - Math.floor(nowUnixSeconds);
  if (diffSeconds <= 0) {
    return "now";
  }
  if (diffSeconds < 60) {
    return "in less than a minute";
  }
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) {
    return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** Normalized next-primary-phase milestone used by the Next phase card. */
export function nextPrimaryPhaseMilestone(
  astronomy: AstronomySnapshot | null,
): { name: AstronomyMoonPhaseName; time: number } | null {
  const moon = astronomy?.groups.moon.data;
  if (!moon || moon.nextPrimaryPhaseName == null) {
    return null;
  }
  if (moon.nextPrimaryPhaseTime == null) {
    return null;
  }
  return { name: moon.nextPrimaryPhaseName, time: moon.nextPrimaryPhaseTime };
}
