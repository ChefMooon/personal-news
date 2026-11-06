import { describe, expect, it } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import {
  formatEventLocation,
  formatVenueLine,
  normalizeCountryKey,
} from "./location-display";

function makeEvent(overrides: Partial<SportEvent> = {}): SportEvent {
  return {
    eventId: "event-1",
    leagueId: "league-1",
    sport: "Baseball",
    homeTeamId: null,
    awayTeamId: null,
    homeTeam: "Home",
    awayTeam: "Away",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: null,
    awayScore: null,
    eventDate: "2026-04-01",
    eventTime: null,
    status: null,
    venue: null,
    ...overrides,
  };
}

describe("formatEventLocation", () => {
  it("uses the region for a domestic event", () => {
    expect(
      formatEventLocation(
        makeEvent({
          venueCity: "Bronx",
          venueRegion: "NY",
          venueCountry: "USA",
        }),
        "United States",
      ),
    ).toBe("Bronx, NY");
  });

  it("uses the country for an event abroad", () => {
    expect(
      formatEventLocation(
        makeEvent({
          venueCity: "Toronto",
          venueRegion: "ON",
          venueCountry: "Canada",
        }),
        "USA",
      ),
    ).toBe("Toronto, Canada");
  });

  it("uses only the city for a domestic event without a region", () => {
    expect(
      formatEventLocation(
        makeEvent({
          venueCity: "London",
          venueCountry: "England",
        }),
        "United Kingdom",
      ),
    ).toBe("London");
  });

  it("uses the region when the league country is unknown", () => {
    expect(
      formatEventLocation(
        makeEvent({
          venueCity: "Bronx",
          venueRegion: "NY",
          venueCountry: "USA",
        }),
        null,
      ),
    ).toBe("Bronx, NY");
  });

  it("uses the country when the league country and region are unknown", () => {
    expect(
      formatEventLocation(
        makeEvent({ venueCity: "Tokyo", venueCountry: "Japan" }),
        undefined,
      ),
    ).toBe("Tokyo, Japan");
  });

  it("returns null without a city", () => {
    expect(
      formatEventLocation(
        makeEvent({ venueRegion: "NY", venueCountry: "USA" }),
        "USA",
      ),
    ).toBeNull();
  });

  it("returns null for a whitespace-only city", () => {
    expect(
      formatEventLocation(
        makeEvent({ venueCity: "  \t ", venueRegion: "NY" }),
        "USA",
      ),
    ).toBeNull();
  });

  it("normalizes the documented country aliases", () => {
    for (const country of [
      "USA",
      "US",
      "U.S.",
      "U.S.A.",
      "United States",
      "United States of America",
    ]) {
      expect(normalizeCountryKey(country)).toBe("united states");
    }
    for (const country of [
      "UK",
      "U.K.",
      "United Kingdom",
      "Great Britain",
      "England",
      "Scotland",
      "Wales",
      "Northern Ireland",
      "The United Kingdom",
    ]) {
      expect(normalizeCountryKey(country)).toBe("united kingdom");
    }
    expect(normalizeCountryKey("  ")).toBeNull();
  });
});

describe("formatVenueLine", () => {
  it("joins a venue and location", () => {
    expect(
      formatVenueLine(
        makeEvent({
          venue: "Rogers Centre",
          venueCity: "Toronto",
          venueCountry: "Canada",
        }),
        "USA",
      ),
    ).toBe("Rogers Centre · Toronto, Canada");
  });

  it("returns only the venue when location is unavailable", () => {
    expect(formatVenueLine(makeEvent({ venue: "Rogers Centre" }), "USA")).toBe(
      "Rogers Centre",
    );
  });

  it("returns only the location when venue is unavailable", () => {
    expect(formatVenueLine(makeEvent({ venueCity: "Toronto" }), "USA")).toBe(
      "Toronto",
    );
  });

  it("returns null when venue and location are unavailable", () => {
    expect(formatVenueLine(makeEvent(), "USA")).toBeNull();
  });
});
