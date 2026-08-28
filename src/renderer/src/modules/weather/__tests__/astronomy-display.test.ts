import { describe, expect, it } from "vitest";
import type { AstronomySnapshot } from "../../../../../shared/ipc-types";
import {
  countdownLabel,
  formatCalculatedAt,
  formatHorizonTime,
  formatNextPhaseDateTime,
  moonPhaseDisplayName,
  nextPrimaryPhaseMilestone,
  solarStateLabel,
} from "../astronomy-display";

// 2026-07-04T12:00:00Z -> 08:00 in America/New_York (EDT), 02:00 next day in
// Pacific/Kiritimati (UTC+14).
const TS = Date.UTC(2026, 6, 4, 12, 0, 0) / 1000;

describe("moon phase display names", () => {
  it("maps canonical phase names to human labels", () => {
    expect(moonPhaseDisplayName("new")).toBe("New Moon");
    expect(moonPhaseDisplayName("waxing_crescent")).toBe("Waxing Crescent");
    expect(moonPhaseDisplayName("first_quarter")).toBe("First Quarter");
    expect(moonPhaseDisplayName("waxing_gibbous")).toBe("Waxing Gibbous");
    expect(moonPhaseDisplayName("full")).toBe("Full Moon");
    expect(moonPhaseDisplayName("waning_gibbous")).toBe("Waning Gibbous");
    expect(moonPhaseDisplayName("last_quarter")).toBe("Third Quarter");
    expect(moonPhaseDisplayName("waning_crescent")).toBe("Waning Crescent");
  });

  it("returns an unavailable label when the phase name is missing", () => {
    expect(moonPhaseDisplayName(null)).toBe("Unavailable");
    expect(moonPhaseDisplayName(undefined)).toBe("Unavailable");
  });
});

describe("solar state labels", () => {
  it("maps every normalized solar state to its factual badge text", () => {
    expect(solarStateLabel("day")).toBe("Daylight");
    expect(solarStateLabel("civil_twilight")).toBe("Civil Twilight");
    expect(solarStateLabel("nautical_twilight")).toBe("Nautical Twilight");
    expect(solarStateLabel("astronomical_twilight")).toBe(
      "Astronomical Twilight",
    );
    expect(solarStateLabel("night")).toBe("Astronomical Night");
    expect(solarStateLabel(null)).toBe("Unavailable");
  });
});

describe("timezone-aware formatting", () => {
  it("formats horizon times in the selected location timezone, not the host zone", () => {
    expect(formatHorizonTime(TS, "America/New_York", "24h")).toBe("08:00");
    expect(formatHorizonTime(TS, "Pacific/Kiritimati", "24h")).toBe("02:00");
    expect(formatHorizonTime(TS, "UTC", "24h")).toBe("12:00");
  });

  it("respects the 12-hour time-format preference", () => {
    const label = formatHorizonTime(TS, "America/New_York", "12h");
    expect(label).toMatch(/8:00/i);
    expect(label).toMatch(/a\.?\s*m\.?/i);
  });

  it("formats next-phase date and time in the selected timezone", () => {
    const label = formatNextPhaseDateTime(TS, "America/New_York", "24h");
    expect(label).toMatch(/Jul/);
    expect(label).toMatch(/4/);
    expect(label).toMatch(/8:00/);
    // The same instant lands on July 5 in UTC+14.
    expect(formatNextPhaseDateTime(TS, "Pacific/Kiritimati", "24h")).toMatch(
      /Jul\s*5/,
    );
  });

  it("treats missing values and invalid zones as unavailable rather than throwing", () => {
    expect(formatHorizonTime(null, "America/New_York", "24h")).toBeNull();
    expect(formatNextPhaseDateTime(null, "UTC", "24h")).toBeNull();
    expect(formatHorizonTime(TS, "Not/AZone", "24h")).toBeNull();
  });

  it("formats calculated-at timestamps in the selected timezone", () => {
    expect(formatCalculatedAt(TS, "America/New_York", "24h")).toMatch(
      /Jul\s*4.*8:00/,
    );
    expect(formatCalculatedAt(TS, "Pacific/Kiritimati", "24h")).toMatch(
      /Jul\s*5.*2:00/,
    );
    expect(formatCalculatedAt(null, "UTC", "24h")).toBeNull();
    expect(formatCalculatedAt(TS, "Not/AZone", "24h")).toBeNull();
  });
});

describe("next-phase countdown wording", () => {
  const now = 1_800_000_000;

  it("handles past and immediate events", () => {
    expect(countdownLabel(now - 5, now)).toBe("now");
    expect(countdownLabel(now, now)).toBe("now");
    expect(countdownLabel(now + 59, now)).toBe("in less than a minute");
  });

  it("uses singular and plural minutes at the boundaries", () => {
    expect(countdownLabel(now + 60, now)).toBe("in 1 minute");
    expect(countdownLabel(now + 119, now)).toBe("in 1 minute");
    expect(countdownLabel(now + 120, now)).toBe("in 2 minutes");
    expect(countdownLabel(now + 59 * 60, now)).toBe("in 59 minutes");
  });

  it("uses singular and plural hours at the boundaries", () => {
    expect(countdownLabel(now + 3600, now)).toBe("in 1 hour");
    expect(countdownLabel(now + 7199, now)).toBe("in 1 hour");
    expect(countdownLabel(now + 7200, now)).toBe("in 2 hours");
    expect(countdownLabel(now + 23 * 3600, now)).toBe("in 23 hours");
  });

  it("uses singular and plural days at the boundaries", () => {
    expect(countdownLabel(now + 86400, now)).toBe("in 1 day");
    expect(countdownLabel(now + 172799, now)).toBe("in 1 day");
    expect(countdownLabel(now + 172800, now)).toBe("in 2 days");
  });

  it("reports unavailable for missing events", () => {
    expect(countdownLabel(null, now)).toBe("Unavailable");
  });
});

describe("next primary phase milestone extraction", () => {
  const base = {
    locationId: "loc-1",
    forTimestamp: 1000,
    calculatedAt: 1000,
    stale: false,
    status: "complete",
    groups: {
      moon: { status: "fresh", data: null },
      horizon: { status: "unavailable", data: null },
      planets: { status: "unavailable", data: [] },
      events: { status: "unavailable", data: [] },
    },
  } as unknown as AstronomySnapshot;

  function withMoon(moon: Record<string, unknown>): AstronomySnapshot {
    return {
      ...base,
      groups: {
        ...base.groups,
        moon: { status: "fresh", data: moon },
      },
    } as unknown as AstronomySnapshot;
  }

  it("extracts the next phase name and time from moon data", () => {
    const milestone = nextPrimaryPhaseMilestone(
      withMoon({ nextPrimaryPhaseName: "full", nextPrimaryPhaseTime: 123 }),
    );
    expect(milestone).toEqual({ name: "full", time: 123 });
  });

  it("returns null when moon data or the milestone fields are absent", () => {
    expect(nextPrimaryPhaseMilestone(base)).toBeNull();
    expect(nextPrimaryPhaseMilestone(null)).toBeNull();
    expect(
      nextPrimaryPhaseMilestone(withMoon({ nextPrimaryPhaseName: "full" })),
    ).toBeNull();
  });
});
