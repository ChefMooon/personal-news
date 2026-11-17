import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeaturedNextGame } from "../FeaturedNextGame";
import {
  formatDateTime,
  formatTime,
  formatWeekdayDate,
} from "../team-display-utils";
import type {
  SportEvent,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../../shared/ipc-types";

function makeEvent(overrides: Partial<SportEvent> = {}): SportEvent {
  return {
    eventId: "evt-1",
    leagueId: "4387",
    sport: "Basketball",
    homeTeamId: "team-raptors",
    awayTeamId: "team-celtics",
    homeTeam: "Toronto Raptors",
    awayTeam: "Boston Celtics",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: null,
    awayScore: null,
    eventDate: "2026-04-23",
    eventTime: "19:00",
    status: "Scheduled",
    venue: "Scotiabank Arena",
    ...overrides,
  };
}

const raptorsTeam: TrackedTeam = {
  teamId: "team-raptors",
  leagueId: "4387",
  sport: "Basketball",
  name: "Toronto Raptors",
  shortName: null,
  badgeUrl: null,
  enabled: true,
  sortOrder: 0,
};

function render(
  game: SportEvent,
  props: {
    showTime?: boolean;
    showVenue?: boolean;
    compact?: boolean;
    teams?: TrackedTeam[];
    teamEventsById?: Record<string, SportTeamEvents>;
  } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(FeaturedNextGame, {
      game,
      teams: props.teams ?? [],
      teamEventsById: props.teamEventsById ?? {},
      showTime: props.showTime ?? true,
      showVenue: props.showVenue ?? true,
      leaguesById: {},
      dense: true,
      compact: props.compact,
    }),
  );
}

describe("FeaturedNextGame", () => {
  it("renders label, both teams and the venue", () => {
    const html = render(makeEvent());
    expect(html).toContain("data-sports-next-up");
    expect(html).toContain("Next up");
    expect(html).toContain("Toronto Raptors");
    expect(html).toContain("Boston Celtics");
    expect(html).toContain("Scotiabank Arena");
  });

  it("omits the venue when showVenue is false", () => {
    expect(render(makeEvent(), { showVenue: false })).not.toContain(
      "Scotiabank Arena",
    );
  });

  it("shows the time when showTime is on and hides it when off", () => {
    const game = makeEvent();
    expect(render(game)).toContain(formatTime(game));
    expect(render(game, { showTime: false })).not.toContain(formatTime(game));
  });

  it("shows TBD and Venue TBD as empty-state copy", () => {
    const html = render(
      makeEvent({ eventTime: null, venue: null, venueCity: null }),
    );
    expect(html).toContain(">TBD<");
    expect(html).toContain("Venue TBD");
  });

  it("puts the next game date in the pill", () => {
    const game = makeEvent();
    const html = render(game);
    expect(html).toContain("Next up");
    expect(html).toContain(formatWeekdayDate(game));
  });

  it("renders placeholder scores", () => {
    expect(render(makeEvent())).toContain(">-</p>");
  });

  it("puts a tracked home team in the left column", () => {
    const html = render(makeEvent(), { teams: [raptorsTeam] });
    expect(html.indexOf("Toronto Raptors")).toBeLessThan(
      html.indexOf("Boston Celtics"),
    );
  });

  it("shows the tracked team's previous result", () => {
    const previousGame = makeEvent({
      eventId: "evt-previous",
      homeTeamId: "team-knicks",
      awayTeamId: "team-raptors",
      homeTeam: "New York Knicks",
      awayTeam: "Toronto Raptors",
      homeScore: "112",
      awayScore: "108",
      status: "Final",
    });
    const html = render(makeEvent(), {
      teams: [raptorsTeam],
      teamEventsById: { "team-raptors": { last: [previousGame], next: [] } },
    });
    expect(html).toContain("TR 108 - 112 NYK");
  });

  it("shows the shared empty previous text without a result", () => {
    expect(render(makeEvent())).toContain("No previous game");
  });

  it("gives the compact card the medium avatar size", () => {
    const html = render(makeEvent(), { compact: true });
    expect(html).toContain("h-7 w-7");
    expect(html).not.toContain("h-6");
  });

  it("keeps Previous in a single column when showVenue is off", () => {
    const html = render(makeEvent(), { showVenue: false });
    expect(html).toContain("grid-cols-1");
    expect(html).not.toContain("Location");
    expect(html).toContain("Previous");
  });

  it("renders the shared sport chip", () => {
    const html = render(makeEvent());
    expect(html).toContain("data-sports-sport-label");
    expect(html).toContain("Basketball");
  });
});

describe("formatDateTime", () => {
  it("matches the original format built from the same Intl options", () => {
    const game = makeEvent();
    const date = new Date(`${game.eventDate}T12:00:00`).toLocaleDateString(
      [],
      { weekday: "short", month: "short", day: "numeric" },
    );
    const time = new Date(
      `${game.eventDate}T${game.eventTime}:00Z`,
    ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    expect(formatDateTime(game, true)).toBe(`${date} ${time}`);
    expect(formatDateTime(game, false)).toBe(date);
    expect(formatDateTime(makeEvent({ eventTime: null }), true)).toBe(date);
  });
});
