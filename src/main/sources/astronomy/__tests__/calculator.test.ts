import { describe, expect, it } from "vitest";
import { calculateGroupsForLocation } from "../calculator";

const NYC = {
  id: "nyc",
  name: "New York",
  admin1: null,
  country: null,
  countryCode: null,
  latitude: 40.7128,
  longitude: -74.006,
  timezone: "America/New_York",
  createdAt: 0,
  lastFetchedAt: null,
};

// Fixed anchor: 2026-06-21T12:00:00Z (near June solstice).
const ANCHOR = Math.floor(Date.UTC(2026, 5, 21, 12, 0, 0) / 1000);

describe("calculateGroupsForLocation", () => {
  it("produces all four fresh groups for a valid location", () => {
    const groups = calculateGroupsForLocation(NYC, ANCHOR);
    expect(groups.moon.status).toBe("fresh");
    expect(groups.horizon.status).toBe("fresh");
    expect(groups.planets.status).toBe("fresh");
    expect(groups.events.status).toBe("fresh");
    expect(groups.moon.data).not.toBeNull();
    expect(groups.horizon.data).not.toBeNull();
  });

  it("returns all seven planets with stable entries", () => {
    const groups = calculateGroupsForLocation(NYC, ANCHOR);
    const bodies = groups.planets.data.map((planet) => planet.body);
    expect(bodies).toEqual([
      "Mercury",
      "Venus",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]);
    for (const planet of groups.planets.data) {
      expect(["up", "below_horizon", "too_bright", "unknown"]).toContain(
        planet.skyState,
      );
    }
  });

  it("computes moon phase fields within valid ranges", () => {
    const moon = calculateGroupsForLocation(NYC, ANCHOR).moon.data!;
    expect(moon.phaseAngle).toBeGreaterThanOrEqual(0);
    expect(moon.phaseAngle).toBeLessThan(360);
    expect(moon.illuminationPercent).toBeGreaterThanOrEqual(0);
    expect(moon.illuminationPercent).toBeLessThanOrEqual(100);
    expect(["waxing", "waning"]).toContain(moon.trend);
    expect(moon.synodicProgress).toBeGreaterThanOrEqual(0);
    expect(moon.synodicProgress).toBeLessThanOrEqual(1);
  });

  it("bounds global events to the next 365 days, max five per family", () => {
    const events = calculateGroupsForLocation(NYC, ANCHOR).events.data;
    const families = new Set(events.map((event) => event.family));
    for (const family of [
      "season",
      "lunar_eclipse",
      "solar_eclipse",
      "transit",
    ]) {
      if (families.has(family as never)) {
        const count = events.filter((event) => event.family === family).length;
        expect(count).toBeLessThanOrEqual(5);
      }
    }
    for (const event of events) {
      expect(event.time).toBeGreaterThanOrEqual(ANCHOR);
      expect(event.time).toBeLessThanOrEqual(ANCHOR + 366 * 86400);
      expect(event.localVisibility).toBeNull();
    }
    // Events are chronologically sorted.
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time);
    }
  });

  it("handles southern hemisphere and other timezones", () => {
    const sydney = {
      ...NYC,
      id: "sydney",
      latitude: -33.8688,
      longitude: 151.2093,
      timezone: "Australia/Sydney",
    };
    const groups = calculateGroupsForLocation(sydney, ANCHOR);
    expect(groups.horizon.data).not.toBeNull();
    // In June, Sydney (southern winter) sun altitude should be lower than NYC's.
    const nycAlt = calculateGroupsForLocation(NYC, ANCHOR).horizon.data!
      .sunAltitude;
    const sydAlt = groups.horizon.data!.sunAltitude;
    if (nycAlt != null && sydAlt != null) {
      expect(sydAlt).toBeLessThan(nycAlt);
    }
  });

  it("fails invalid coordinates independently without throwing", () => {
    const invalid = { ...NYC, id: "bad", latitude: Number.NaN };
    const groups = calculateGroupsForLocation(invalid, ANCHOR);
    expect(groups.moon.status).toBe("unavailable");
    expect(groups.moon.data).toBeNull();
  });
});
