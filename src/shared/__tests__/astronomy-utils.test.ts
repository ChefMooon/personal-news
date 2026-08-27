import { describe, expect, it } from "vitest";
import {
  isValidLatitude,
  isValidLongitude,
  moonPhaseNameFromAngle,
  normalizeIlluminationPercent,
  solarStateFromAltitude,
  synodicProgressFromAngle,
  toUnixSecondsOrNull,
  waxingTrendFromAngle,
} from "../astronomy-utils";

describe("moonPhaseNameFromAngle", () => {
  it("maps primary phase angles to names", () => {
    expect(moonPhaseNameFromAngle(0)).toBe("new");
    expect(moonPhaseNameFromAngle(90)).toBe("first_quarter");
    expect(moonPhaseNameFromAngle(180)).toBe("full");
    expect(moonPhaseNameFromAngle(270)).toBe("last_quarter");
  });

  it("handles wraparound near 360", () => {
    expect(moonPhaseNameFromAngle(350)).toBe("new");
    expect(moonPhaseNameFromAngle(-10)).toBe("new");
  });

  it("uses centered buckets", () => {
    // Just below the first-quarter boundary (67.5 deg) -> waxing_crescent
    expect(moonPhaseNameFromAngle(60)).toBe("waxing_crescent");
    expect(moonPhaseNameFromAngle(80)).toBe("first_quarter");
  });
});

describe("waxingTrendFromAngle", () => {
  it("classifies waxing and waning", () => {
    expect(waxingTrendFromAngle(45)).toBe("waxing");
    expect(waxingTrendFromAngle(200)).toBe("waning");
    expect(waxingTrendFromAngle(179.9)).toBe("waxing");
    expect(waxingTrendFromAngle(180.1)).toBe("waning");
  });
});

describe("synodicProgressFromAngle", () => {
  it("maps new/full correctly", () => {
    expect(synodicProgressFromAngle(0)).toBeCloseTo(0);
    expect(synodicProgressFromAngle(180)).toBeCloseTo(0.5);
    expect(synodicProgressFromAngle(359)).toBeCloseTo(0.9972, 3);
  });
});

describe("solarStateFromAltitude", () => {
  it("applies inclusive thresholds", () => {
    expect(solarStateFromAltitude(10)).toBe("day");
    expect(solarStateFromAltitude(0)).toBe("day");
    expect(solarStateFromAltitude(-5)).toBe("civil_twilight");
    expect(solarStateFromAltitude(-6)).toBe("civil_twilight");
    expect(solarStateFromAltitude(-11)).toBe("nautical_twilight");
    expect(solarStateFromAltitude(-17)).toBe("astronomical_twilight");
    expect(solarStateFromAltitude(-18)).toBe("astronomical_twilight");
    expect(solarStateFromAltitude(-30)).toBe("night");
  });
});

describe("normalizeIlluminationPercent", () => {
  it("converts fraction to clamped percent", () => {
    expect(normalizeIlluminationPercent(0.5)).toBe(50);
    expect(normalizeIlluminationPercent(1.2)).toBe(100);
    expect(normalizeIlluminationPercent(-0.1)).toBe(0);
    expect(normalizeIlluminationPercent(Number.NaN)).toBeNull();
  });
});

describe("toUnixSecondsOrNull", () => {
  it("floors to seconds and rejects invalid values", () => {
    expect(toUnixSecondsOrNull(new Date(1700000000500))).toBe(1700000000);
    expect(toUnixSecondsOrNull(1700000000900)).toBe(1700000000);
    expect(toUnixSecondsOrNull(null)).toBeNull();
    expect(toUnixSecondsOrNull(Number.NaN)).toBeNull();
  });
});

describe("observer validation", () => {
  it("validates latitude and longitude ranges", () => {
    expect(isValidLatitude(45)).toBe(true);
    expect(isValidLatitude(91)).toBe(false);
    expect(isValidLatitude(Number.NaN)).toBe(false);
    expect(isValidLongitude(180)).toBe(true);
    expect(isValidLongitude(-180.5)).toBe(false);
  });
});
