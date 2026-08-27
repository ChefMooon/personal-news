import {
  ASTRONOMY_MOON_PHASE_NAMES,
  type AstronomyMoonPhaseName,
  type AstronomySolarState,
} from "./ipc-types";

/**
 * Deterministic eight-bucket moon phase naming from a phase angle in degrees
 * (0 = new, 180 = full). Buckets are centered on each primary/intermediate
 * phase with wraparound handled modulo 360.
 */
export function moonPhaseNameFromAngle(
  angleDeg: number,
): AstronomyMoonPhaseName {
  const normalized = ((angleDeg % 360) + 360) % 360;
  // Each bucket spans 45 degrees, centered on the phase angle.
  const index = Math.floor(((normalized + 22.5) % 360) / 45);
  return ASTRONOMY_MOON_PHASE_NAMES[index];
}

export function waxingTrendFromAngle(angleDeg: number): "waxing" | "waning" {
  const normalized = ((angleDeg % 360) + 360) % 360;
  return normalized < 180 ? "waxing" : "waning";
}

/** Synodic progress as 0..1 where 0 = new moon and 0.5 = full moon. */
export function synodicProgressFromAngle(angleDeg: number): number {
  const normalized = ((angleDeg % 360) + 360) % 360;
  return normalized / 360;
}

const SOLAR_THRESHOLDS_DEG = {
  day: 0,
  civil: -6,
  nautical: -12,
  astronomical: -18,
} as const;

export function solarStateFromAltitude(
  altitudeDeg: number,
): AstronomySolarState["state"] {
  if (altitudeDeg >= SOLAR_THRESHOLDS_DEG.day) return "day";
  if (altitudeDeg >= SOLAR_THRESHOLDS_DEG.civil) return "civil_twilight";
  if (altitudeDeg >= SOLAR_THRESHOLDS_DEG.nautical) return "nautical_twilight";
  if (altitudeDeg >= SOLAR_THRESHOLDS_DEG.astronomical)
    return "astronomical_twilight";
  return "night";
}

/** Clamp to [0, 100] and reject non-finite values. */
export function normalizeIlluminationPercent(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value * 100));
}

/** Round timestamps to whole Unix seconds; reject invalid values. */
export function toUnixSecondsOrNull(
  value: Date | number | null,
): number | null {
  if (value == null) return null;
  const millis = value instanceof Date ? value.getTime() : value;
  if (typeof millis !== "number" || !Number.isFinite(millis)) return null;
  if (!Number.isFinite(new Date(millis).getTime())) return null;
  return Math.floor(millis / 1000);
}

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 90
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= 180
  );
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
