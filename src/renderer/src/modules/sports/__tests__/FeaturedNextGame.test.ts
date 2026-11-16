import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeaturedNextGame } from "../FeaturedNextGame";
import { formatDateTime, formatWeekdayDate } from "../team-display-utils";
import type { SportEvent } from "../../../../../shared/ipc-types";

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

function render(
  game: SportEvent,
  props: { showTime?: boolean; showVenue?: boolean; compact?: boolean } = {},
): string {
  return renderToStaticMarkup(
    React.createElement(FeaturedNextGame, {
      game,
      teams: [],
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

  it("omits the time line when showTime is false", () => {
    const html = render(makeEvent(), { showTime: false });
    expect(html).not.toContain("tabular-nums");
    expect(html).not.toContain("Time TBD");
  });

  it("shows Time TBD when showTime is true and the time is missing", () => {
    expect(render(makeEvent({ eventTime: null }))).toContain("Time TBD");
  });

  it("renders a single-line time row when compact", () => {
    const html = render(makeEvent(), { compact: true });
    expect(html).not.toContain("tabular-nums");
    expect(html).toContain(" · ");
  });
});

describe("compact without time", () => {
  it("shows the date only, with no time or separator", () => {
    const game = makeEvent();
    const html = render(game, { compact: true, showTime: false });
    expect(html).toContain(formatWeekdayDate(game));
    expect(html).not.toContain("Time TBD");
    expect(html).not.toContain(" · ");
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
