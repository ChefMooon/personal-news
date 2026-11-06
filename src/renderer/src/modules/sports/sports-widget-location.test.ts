import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getLocalDateKey } from "../../../../shared/sports-event-utils";
import type { SportEvent, SportLeague } from "../../../../shared/ipc-types";
import { CompactSportsView } from "./CompactSportsView";
import { MediumLiveGameView } from "./MediumLiveGameView";

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
    eventDate: getLocalDateKey(new Date()),
    eventTime: "19:00",
    status: "Scheduled",
    venue: "Rogers Centre",
    venueCity: "Toronto",
    venueRegion: "ON",
    venueCountry: "Canada",
    ...overrides,
  };
}

const leaguesById: Record<string, SportLeague> = {
  "Baseball:league-1": {
    leagueId: "league-1",
    sport: "Baseball",
    name: "League",
    country: "USA",
    logoUrl: null,
    enabled: true,
    sortOrder: 0,
  },
};

function renderCompact(event: SportEvent, showVenue: boolean): string {
  return renderToStaticMarkup(
    React.createElement(CompactSportsView, {
      events: [event],
      teams: [],
      teamEventsById: {},
      selectedGameId: event.eventId,
      onSelectGame: () => {},
      showTime: true,
      showVenue,
      leaguesById,
    }),
  );
}

describe("Sports widget location rendering", () => {
  it("hides the Compact location cell and gives Previous the full-width column", () => {
    const markup = renderCompact(makeEvent(), false);
    expect(markup).not.toContain("Location");
    expect(markup).toContain("Previous");
    expect(markup).toContain("grid-cols-1");
    expect(markup).not.toContain("divide-x");
  });

  it("shows a formatted location, venue-only fallback, and Venue TBD in Compact", () => {
    const withLocation = renderCompact(makeEvent(), true);
    expect(withLocation).toContain("Rogers Centre · Toronto, Canada");

    const venueOnly = renderCompact(
      makeEvent({
        venueCity: null,
        venueRegion: null,
        venueCountry: null,
      }),
      true,
    );
    expect(venueOnly).toContain('title="Rogers Centre"');
    expect(venueOnly).not.toContain("Toronto");

    const noVenue = renderCompact(
      makeEvent({
        venue: null,
        venueCity: null,
        venueRegion: null,
        venueCountry: null,
      }),
      true,
    );
    expect(noVenue).toContain('title="Venue TBD"');
    expect(noVenue).toContain("Venue TBD");
  });

  it("hides the Medium location cell while preserving the Previous cell", () => {
    const event = makeEvent();
    const markup = renderToStaticMarkup(
      React.createElement(MediumLiveGameView, {
        events: [event],
        teams: [],
        teamEventsById: {},
        selectedGameId: event.eventId,
        onSelectGame: () => {},
        showVenue: false,
        leaguesById,
      }),
    );
    expect(markup).not.toContain("Location");
    expect(markup).toContain("Previous");
    expect(markup).toContain("grid-cols-1");
    expect(markup).not.toContain("divide-x");
  });
});
