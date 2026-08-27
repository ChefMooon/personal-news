import {
  ApsisKind,
  Body,
  Equator,
  Horizon,
  Illumination,
  Libration,
  MoonPhase,
  NextGlobalSolarEclipse,
  NextLunarApsis,
  NextLunarEclipse,
  Observer,
  SearchGlobalSolarEclipse,
  SearchLunarApsis,
  SearchLunarEclipse,
  SearchMoonPhase,
  SearchRiseSet,
  SearchTransit,
  Seasons,
  MakeTime,
} from "astronomy-engine";
import type { AstroTime } from "astronomy-engine";
import type { WeatherLocation } from "../../../shared/ipc-types";
import type {
  AstronomyGlobalEvent,
  AstronomyGroups,
  AstronomyHorizonData,
  AstronomyMoonData,
  AstronomyMoonPhaseName,
  AstronomyPlanetData,
} from "../../../shared/ipc-types";
import {
  moonPhaseNameFromAngle,
  normalizeIlluminationPercent,
  solarStateFromAltitude,
  synodicProgressFromAngle,
  toUnixSecondsOrNull,
  waxingTrendFromAngle,
  isValidLatitude,
  isValidLongitude,
} from "../../../shared/astronomy-utils";
import { localDayIntervalUtc } from "./time";

const PLANET_BODIES = [
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
] as const;

const AU_KM = 149_597_870.7;

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function observerFor(location: WeatherLocation): Observer {
  if (
    !isValidLatitude(location.latitude) ||
    !isValidLongitude(location.longitude)
  ) {
    throw new Error(`Invalid coordinates for location ${location.id}.`);
  }
  // Zero-meter observer elevation per specification.
  return new Observer(location.latitude, location.longitude, 0);
}

function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function computeMoonGroup(time: AstroTime): AstronomyMoonData {
  const phaseAngle = MoonPhase(time);
  const illum = Illumination(Body.Moon, time);
  const libration = Libration(time);
  const distanceAu = finiteOrNull(illum.geo_dist);

  let nextPhaseName: AstronomyMoonPhaseName | null = null;
  let nextPhaseTime: number | null = null;
  // -1 finds the next quarter phase of any kind.
  const nextQuarter = safe(() => SearchMoonPhase(-1, time, 30));
  if (nextQuarter) {
    nextPhaseTime = toUnixSecondsOrNull(nextQuarter.date);
    nextPhaseName = moonPhaseNameFromAngle(MoonPhase(nextQuarter));
  }

  let nextPerigee: number | null = null;
  let nextApogee: number | null = null;
  const firstApsis = safe(() => SearchLunarApsis(time));
  if (firstApsis) {
    const second = safe(() => NextLunarApsis(firstApsis));
    const perigee =
      firstApsis.kind === ApsisKind.Pericenter ? firstApsis : second;
    const apogee =
      firstApsis.kind === ApsisKind.Apocenter ? firstApsis : second;
    nextPerigee = perigee ? toUnixSecondsOrNull(perigee.time.date) : null;
    nextApogee = apogee ? toUnixSecondsOrNull(apogee.time.date) : null;
  }

  return {
    phaseAngle: finiteOrNull(phaseAngle) ?? 0,
    phaseName: moonPhaseNameFromAngle(phaseAngle),
    illuminationPercent:
      normalizeIlluminationPercent(illum.phase_fraction) ?? 0,
    trend: waxingTrendFromAngle(phaseAngle),
    synodicProgress: synodicProgressFromAngle(phaseAngle),
    distanceKm: distanceAu == null ? null : distanceAu * AU_KM,
    librationLatitude: finiteOrNull(libration.elat),
    librationLongitude: finiteOrNull(libration.elon),
    nextPrimaryPhaseName: nextPhaseName,
    nextPrimaryPhaseTime: nextPhaseTime,
    nextPerigeeTime: nextPerigee,
    nextApogeeTime: nextApogee,
  };
}

/** Local-day rise/set. No rise or no set within the day is `null`, not an error. */
function riseSet(
  body: Body,
  observer: Observer,
  dayStart: Date,
  dayEnd: Date,
): { riseTime: number | null; setTime: number | null } {
  const rise = safe(() => SearchRiseSet(body, observer, +1, dayStart, 2));
  const set = safe(() => SearchRiseSet(body, observer, -1, dayStart, 2));
  const riseTime =
    rise && rise.date <= dayEnd ? toUnixSecondsOrNull(rise.date) : null;
  const setTime =
    set && set.date <= dayEnd ? toUnixSecondsOrNull(set.date) : null;
  return { riseTime, setTime };
}

function horizontal(
  body: Body,
  observer: Observer,
  time: AstroTime,
): { altitude: number | null; azimuth: number | null } {
  return (
    safe(() => {
      const equ = Equator(body, time, observer, true, true);
      const hor = Horizon(time, observer, equ.ra, equ.dec, "normal");
      return {
        altitude: finiteOrNull(hor.altitude),
        azimuth: finiteOrNull(hor.azimuth),
      };
    }) ?? { altitude: null, azimuth: null }
  );
}

function computeHorizonGroup(
  observer: Observer,
  time: AstroTime,
  dayStart: Date,
  dayEnd: Date,
): AstronomyHorizonData {
  const sun = riseSet(Body.Sun, observer, dayStart, dayEnd);
  const moon = riseSet(Body.Moon, observer, dayStart, dayEnd);
  const sunPos = horizontal(Body.Sun, observer, time);
  const moonPos = horizontal(Body.Moon, observer, time);

  return {
    sun,
    moon,
    sunAltitude: sunPos.altitude,
    sunAzimuth: sunPos.azimuth,
    moonAltitude: moonPos.altitude,
    moonAzimuth: moonPos.azimuth,
    solarState:
      sunPos.altitude != null
        ? solarStateFromAltitude(sunPos.altitude)
        : "night",
  };
}

function skyStateFor(
  altitudeDeg: number | null,
  magnitude: number | null,
  sunAltitudeDeg: number | null,
): AstronomyPlanetData["skyState"] {
  if (altitudeDeg == null || magnitude == null) {
    return "unknown";
  }
  if (altitudeDeg <= 0) {
    return "below_horizon";
  }
  // Ordered factual rules: above horizon but washed out by daylight.
  if (sunAltitudeDeg != null && sunAltitudeDeg > -6 && magnitude > -1.0) {
    return "too_bright";
  }
  return "up";
}

function computePlanetGroup(
  observer: Observer,
  time: AstroTime,
  dayStart: Date,
  dayEnd: Date,
  sunAltitude: number | null,
): AstronomyPlanetData[] {
  const planets: AstronomyPlanetData[] = [];
  for (const bodyName of PLANET_BODIES) {
    const body = Body[bodyName];
    const pos = horizontal(body, observer, time);
    const illum = safe(() => Illumination(body, time));
    const rs = riseSet(body, observer, dayStart, dayEnd);
    planets.push({
      body: bodyName,
      altitude: pos.altitude,
      azimuth: pos.azimuth,
      riseTime: rs.riseTime,
      setTime: rs.setTime,
      magnitude: finiteOrNull(illum?.mag),
      illuminationPercent:
        illum?.phase_fraction != null
          ? normalizeIlluminationPercent(illum.phase_fraction)
          : null,
      phaseAngle: finiteOrNull(illum?.phase_angle),
      heliocentricDistanceAu: finiteOrNull(illum?.helio_dist),
      geocentricDistanceAu: finiteOrNull(illum?.geo_dist),
      eclipticLongitude: null,
      eclipticLatitude: null,
      skyState: skyStateFor(pos.altitude, illum?.mag ?? null, sunAltitude),
    });
  }
  return planets;
}

function computeEventGroup(now: Date): AstronomyGlobalEvent[] {
  const events: AstronomyGlobalEvent[] = [];
  const horizonDate = new Date(now.getTime() + 365 * 86_400_000);

  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const seasons = safe(() => Seasons(year));
    if (seasons) {
      for (const [label, value] of [
        ["March equinox", seasons.mar_equinox],
        ["June solstice", seasons.jun_solstice],
        ["September equinox", seasons.sep_equinox],
        ["December solstice", seasons.dec_solstice],
      ] as const) {
        const t = toUnixSecondsOrNull(value.date);
        if (t != null && value.date >= now && value.date <= horizonDate) {
          events.push({
            family: "season",
            label,
            time: t,
            localVisibility: null,
          });
        }
      }
    }
  }

  let lunarCursor = safe(() => SearchLunarEclipse(now));
  for (let count = 0; count < 5 && lunarCursor; count += 1) {
    if (lunarCursor.peak.date > horizonDate) break;
    const t = toUnixSecondsOrNull(lunarCursor.peak.date);
    if (t != null) {
      events.push({
        family: "lunar_eclipse",
        label:
          lunarCursor.kind === "total"
            ? "Total lunar eclipse"
            : lunarCursor.kind === "partial"
              ? "Partial lunar eclipse"
              : "Penumbral lunar eclipse",
        time: t,
        localVisibility: null,
      });
    }
    lunarCursor = safe(() => NextLunarEclipse(lunarCursor as never));
  }

  let solarCursor = safe(() => SearchGlobalSolarEclipse(now));
  for (let count = 0; count < 5 && solarCursor; count += 1) {
    if (solarCursor.peak.date > horizonDate) break;
    const t = toUnixSecondsOrNull(solarCursor.peak.date);
    if (t != null) {
      events.push({
        family: "solar_eclipse",
        label:
          solarCursor.kind === "total"
            ? "Total solar eclipse"
            : solarCursor.kind === "annular"
              ? "Annular solar eclipse"
              : "Partial solar eclipse",
        time: t,
        localVisibility: null,
      });
    }
    solarCursor = safe(() => NextGlobalSolarEclipse(solarCursor as never));
  }

  for (const planet of ["Mercury", "Venus"] as const) {
    let transitInfo = safe(() => SearchTransit(Body[planet], now));
    for (let count = 0; count < 5 && transitInfo; count += 1) {
      if (transitInfo.start.date > horizonDate) break;
      const t = toUnixSecondsOrNull(transitInfo.start.date);
      if (t != null) {
        events.push({
          family: "transit",
          label: `${planet} transit`,
          time: t,
          localVisibility: null,
        });
      }
      const finish = transitInfo.finish;
      transitInfo = safe(() => SearchTransit(Body[planet], finish));
    }
  }

  events.sort((a, b) => a.time - b.time);
  return events;
}

/**
 * Calculate all astronomy groups for one location at a single captured UTC
 * anchor. Group-level failures are isolated: each group independently falls
 * back to `unavailable` without affecting other groups.
 */
export function calculateGroupsForLocation(
  location: WeatherLocation,
  forTimestamp: number,
): AstronomyGroups {
  if (!Number.isFinite(forTimestamp) || !Number.isInteger(forTimestamp)) {
    const unavailable = { status: "unavailable" as const, data: null };
    return {
      moon: unavailable,
      horizon: unavailable,
      planets: { status: "unavailable", data: [] },
      events: { status: "unavailable", data: [] },
    };
  }
  const anchorDate = new Date(forTimestamp * 1000);
  const time = MakeTime(anchorDate);

  const moonGroup: AstronomyGroups["moon"] = (() => {
    try {
      observerFor(location);
      return { status: "fresh", data: computeMoonGroup(time) };
    } catch (error) {
      console.error("[Astronomy] Moon group failed:", error);
      return { status: "unavailable", data: null };
    }
  })();

  const horizonGroup: AstronomyGroups["horizon"] = (() => {
    try {
      const observer = observerFor(location);
      const bounds = localDayBounds(location.timezone, anchorDate);
      return {
        status: "fresh",
        data: computeHorizonGroup(observer, time, bounds.start, bounds.end),
      };
    } catch (error) {
      console.error("[Astronomy] Horizon group failed:", error);
      return { status: "unavailable", data: null };
    }
  })();

  const planetGroup: AstronomyGroups["planets"] = (() => {
    try {
      const observer = observerFor(location);
      const bounds = localDayBounds(location.timezone, anchorDate);
      const sunAlt = horizonGroup.data?.sunAltitude ?? null;
      return {
        status: "fresh",
        data: computePlanetGroup(
          observer,
          time,
          bounds.start,
          bounds.end,
          sunAlt,
        ),
      };
    } catch (error) {
      console.error("[Astronomy] Planet group failed:", error);
      return { status: "unavailable", data: [] };
    }
  })();

  const eventGroup: AstronomyGroups["events"] = (() => {
    try {
      return { status: "fresh", data: computeEventGroup(anchorDate) };
    } catch (error) {
      console.error("[Astronomy] Event group failed:", error);
      return { status: "unavailable", data: [] };
    }
  })();

  return {
    moon: moonGroup,
    horizon: horizonGroup,
    planets: planetGroup,
    events: eventGroup,
  };
}

function localDayBounds(
  timeZone: string,
  instant: Date,
): { start: Date; end: Date } {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

  const interval = localDayIntervalUtc(localDate, timeZone);
  if (!interval) throw new Error(`Invalid timezone or local date: ${timeZone}`);
  return {
    start: new Date(interval.start * 1000),
    end: new Date(interval.end * 1000),
  };
}
