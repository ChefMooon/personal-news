import { describe, expect, it } from "vitest";
import type {
  AstronomyGlobalEvent,
  AstronomyHorizonData,
  AstronomyPlanetData,
} from "../../../../../shared/ipc-types";
import {
  CANONICAL_PLANET_ORDER,
  clampSynodicProgress,
  countdownLabel,
  eventFamilyLabel,
  formatAstronomicalUnits,
  formatCalculatedAt,
  formatDegrees,
  formatKilometers,
  formatMagnitudeValue,
  horizonGeometryState,
  moonPhaseDisplayName,
  nearestSynodicMilestone,
  nextRiseSetItem,
  planetsInCanonicalOrder,
  planetDisplayState,
  skyArcPosition,
  solarStateLabel,
  SUMMARY_EVENT_LIMIT,
  upcomingGlobalEvents,
} from "../astronomy-display";

const NOW = 1_800_000_000;

function planet(
  overrides: Partial<AstronomyPlanetData>,
): Pick<AstronomyPlanetData, "skyState" | "altitude"> {
  return { altitude: 30, skyState: "up", ...overrides };
}

describe("planet display states", () => {
  it("maps backend sky states to the five factual labels", () => {
    expect(planetDisplayState(planet({ skyState: "below_horizon" }))).toBe(
      "Below horizon",
    );
    expect(planetDisplayState(planet({ skyState: "too_bright" }))).toBe(
      "Daylight",
    );
    expect(planetDisplayState(planet({ skyState: "unknown" }))).toBe("Unknown");
    expect(planetDisplayState(planet({ skyState: null as never }))).toBe(
      "Unknown",
    );
  });

  it("splits up planets into near-horizon and potentially visible by altitude", () => {
    expect(planetDisplayState(planet({ altitude: 4 }))).toBe("Near horizon");
    expect(planetDisplayState(planet({ altitude: 9.9 }))).toBe("Near horizon");
    expect(planetDisplayState(planet({ altitude: 10 }))).toBe(
      "Potentially visible",
    );
    expect(planetDisplayState(planet({ altitude: null }))).toBe(
      "Potentially visible",
    );
  });

  it("never emits real-world visibility wording", () => {
    const forbidden = ["Visible Sky", "Naked-eye", "Naked eye"];
    for (const altitude of [-20, 0, 5, 45]) {
      for (const skyState of [
        "up",
        "below_horizon",
        "too_bright",
        "unknown",
      ] as const) {
        const label = planetDisplayState(planet({ altitude, skyState }));
        for (const phrase of forbidden) {
          expect(label).not.toContain(phrase);
        }
      }
    }
  });
});

describe("canonical planet ordering", () => {
  const data = [
    { body: "Neptune" },
    { body: "Mercury" },
    { body: "Pluto" },
  ] as unknown as AstronomyPlanetData[];

  it("lists exactly the seven supported bodies in order with gaps preserved", () => {
    const ordered = planetsInCanonicalOrder(data);
    expect(ordered.map((entry) => entry.body)).toEqual([
      ...CANONICAL_PLANET_ORDER,
    ]);
    expect(ordered[0].entry?.body).toBe("Mercury");
    expect(ordered[6].entry?.body).toBe("Neptune");
    expect(ordered[1].entry).toBeNull();
  });

  it("handles missing or empty data without dropping entries", () => {
    expect(planetsInCanonicalOrder(null)).toHaveLength(7);
    expect(planetsInCanonicalOrder([])[2].body).toBe("Mars");
  });
});

describe("event family labels and global scope", () => {
  it("labels every supported family factually", () => {
    expect(eventFamilyLabel("season")).toBe("Season");
    expect(eventFamilyLabel("lunar_eclipse")).toBe("Lunar eclipse");
    expect(eventFamilyLabel("solar_eclipse")).toBe("Solar eclipse");
    expect(eventFamilyLabel("transit")).toBe("Transit");
    expect(eventFamilyLabel(null)).toBe("Unavailable");
  });
});

describe("upcoming global events", () => {
  const events = [
    { family: "season", label: "Later season", time: NOW + 7200 },
    { family: "transit", label: "Mercury transit", time: NOW + 100 },
    { family: "season", label: "Past season", time: NOW - 500 },
    { family: "lunar_eclipse", label: "Total lunar eclipse", time: NOW + 3600 },
  ] as unknown as AstronomyGlobalEvent[];

  it("sorts chronologically and drops past events", () => {
    const upcoming = upcomingGlobalEvents(events, NOW);
    expect(upcoming.map((event) => event.label)).toEqual([
      "Mercury transit",
      "Total lunar eclipse",
      "Later season",
    ]);
  });

  it("tolerates missing lists and malformed timestamps", () => {
    expect(upcomingGlobalEvents(null, NOW)).toEqual([]);
    expect(
      upcomingGlobalEvents(
        [
          { family: "season", label: "Bad", time: NaN },
        ] as unknown as AstronomyGlobalEvent[],
        NOW,
      ),
    ).toEqual([]);
  });

  it("exposes a summary bound constant of five", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      family: "season",
      label: `Season ${index}`,
      time: NOW + index + 1,
      localVisibility: null,
    })) as AstronomyGlobalEvent[];
    expect(
      upcomingGlobalEvents(many, NOW).slice(0, SUMMARY_EVENT_LIMIT),
    ).toHaveLength(SUMMARY_EVENT_LIMIT);
  });
});

describe("synodic progress presentation", () => {
  it("clamps progress into the stable 0-100 indicator range", () => {
    expect(clampSynodicProgress(-5)).toBe(0);
    expect(clampSynodicProgress(42.4)).toBe(42.4);
    expect(clampSynodicProgress(150)).toBe(100);
    expect(clampSynodicProgress(null)).toBeNull();
    expect(clampSynodicProgress(NaN)).toBeNull();
  });

  it("names the nearest primary milestone including the wrap to New Moon", () => {
    expect(nearestSynodicMilestone(0)).toBe("New Moon");
    expect(nearestSynodicMilestone(24)).toBe("First Quarter");
    expect(nearestSynodicMilestone(37)).toBe("First Quarter");
    expect(nearestSynodicMilestone(38)).toBe("Full Moon");
    expect(nearestSynodicMilestone(60)).toBe("Full Moon");
    expect(nearestSynodicMilestone(87)).toBe("Third Quarter");
    expect(nearestSynodicMilestone(95)).toBe("New Moon");
    expect(nearestSynodicMilestone(100)).toBe("New Moon");
    expect(nearestSynodicMilestone(null)).toBe("Unavailable");
  });
});

describe("numeric value formatting", () => {
  it("formats degrees, kilometers, AU, and magnitude with unavailable nulls", () => {
    expect(formatDegrees(23.6)).toBe("24°");
    expect(formatDegrees(-5.2)).toBe("-5°");
    expect(formatDegrees(null)).toBeNull();
    expect(formatKilometers(384400)).toMatch(/384,400 km|384\.400 km/);
    expect(formatKilometers(undefined)).toBeNull();
    expect(formatAstronomicalUnits(1.523)).toBe("1.52 AU");
    expect(formatAstronomicalUnits(NaN)).toBeNull();
    expect(formatMagnitudeValue(-2.14)).toBe("-2.1");
    expect(formatMagnitudeValue(null)).toBeNull();
  });
});

describe("next rise/set selection", () => {
  const horizon = {
    sun: { riseTime: NOW - 3600, setTime: NOW + 8000 },
    moon: { riseTime: NOW + 2000, setTime: NOW - 10 },
    sunAltitude: 10,
    sunAzimuth: 180,
    moonAltitude: -20,
    moonAzimuth: 90,
    solarState: "day",
  } as AstronomyHorizonData;

  it("picks the nearest future event among all four local-day items", () => {
    const next = nextRiseSetItem(horizon, NOW);
    expect(next).toEqual({ label: "Moonrise", time: NOW + 2000 });
  });

  it("returns null when every provided time has already passed or none exist", () => {
    const pastOnly = {
      ...horizon,
      sun: { riseTime: NOW - 5000, setTime: NOW - 300 },
      moon: { riseTime: NOW - 2000, setTime: NOW - 10 },
    } as AstronomyHorizonData;
    expect(nextRiseSetItem(pastOnly, NOW)).toBeNull();
    expect(nextRiseSetItem(null, NOW)).toBeNull();
  });
});

describe("horizon geometry state wording", () => {
  it("states above/below horizon factually from altitude", () => {
    expect(horizonGeometryState(12)).toBe("Above horizon");
    expect(horizonGeometryState(-0.5)).toBe("Below horizon");
    expect(horizonGeometryState(null)).toBe("Unavailable");
  });
});

describe("sky arc positioning", () => {
  it("maps azimuth east-to-west across the plot and clamps outside", () => {
    expect(skyArcPosition(45, 90)).toEqual({ xPercent: 0, yPercent: 50 });
    expect(skyArcPosition(45, 270)).toEqual({ xPercent: 100, yPercent: 50 });
    expect(skyArcPosition(0, 180)).toEqual({ xPercent: 50, yPercent: 100 });
    expect(skyArcPosition(90, 180)).toEqual({ xPercent: 50, yPercent: 0 });
    // North (0°) and beyond west clamp onto the edges.
    expect(skyArcPosition(30, 0)?.xPercent).toBe(0);
    expect(skyArcPosition(30, 350)?.xPercent).toBe(100);
  });

  it("returns null for incomplete positions instead of guessing", () => {
    expect(skyArcPosition(null, 180)).toBeNull();
    expect(skyArcPosition(30, undefined)).toBeNull();
  });
});

describe("calculated-at stamp formatting", () => {
  const TS = Date.UTC(2026, 6, 4, 12, 0, 0) / 1000;

  it("formats in the selected location timezone only", () => {
    expect(formatCalculatedAt(TS, "America/New_York", "24h")).toMatch(/Jul/);
    expect(formatCalculatedAt(TS, null, "24h")).toBeNull();
    expect(formatCalculatedAt(null, "America/New_York", "24h")).toBeNull();
  });
});

describe("shared helper reuse stays consistent with the Weather strip", () => {
  it("re-exports identical phase, solar-state, and countdown behavior", () => {
    expect(moonPhaseDisplayName("full")).toBe("Full Moon");
    expect(moonPhaseDisplayName(null)).toBe("Unavailable");
    expect(solarStateLabel("civil_twilight")).toBe("Civil Twilight");
    expect(countdownLabel(NOW + 60, NOW)).toBe("in 1 minute");
  });
});
