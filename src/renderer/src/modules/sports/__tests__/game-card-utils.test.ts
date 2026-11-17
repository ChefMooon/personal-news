import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPreviousResult, shortTeamName } from "../game-card-utils";
import { GameCardFooter } from "../GameCardFooter";
import { SportLabel } from "../SportLabel";
import { CompactSportsView } from "../CompactSportsView";
import { MediumLiveGameView } from "../MediumLiveGameView";
import { getLocalDateKey } from "../../../../../shared/sports-event-utils";
import type { SportEvent, TrackedTeam } from "../../../../../shared/ipc-types";

function makeEvent(overrides: Partial<SportEvent> = {}): SportEvent {
  return {
    eventId: "evt-previous",
    leagueId: "4387",
    sport: "Basketball",
    homeTeamId: "team-knicks",
    awayTeamId: "team-raptors",
    homeTeam: "New York Knicks",
    awayTeam: "Toronto Raptors",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: "112",
    awayScore: "108",
    eventDate: "2026-04-21",
    eventTime: "19:00",
    status: "Final",
    venue: "Madison Square Garden",
    ...overrides,
  };
}

function makeTeam(overrides: Partial<TrackedTeam> = {}): TrackedTeam {
  return {
    teamId: "team-raptors",
    leagueId: "4387",
    sport: "Basketball",
    name: "Toronto Raptors",
    shortName: null,
    badgeUrl: null,
    enabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

describe("shortTeamName", () => {
  it("uses initials for multi-word names and a prefix for one word", () => {
    expect(shortTeamName("Toronto Raptors")).toBe("TR");
    expect(shortTeamName("New York Knicks")).toBe("NYK");
    expect(shortTeamName("Raptors")).toBe("Raptors");
  });
});

describe("formatPreviousResult", () => {
  it("shows the tracked result first when the tracked team is away", () => {
    expect(formatPreviousResult(makeEvent(), makeTeam())).toBe(
      "TR 108 - 112 NYK",
    );
  });

  it("flips the scores when the tracked team is home", () => {
    const game = makeEvent({
      homeTeamId: "team-raptors",
      awayTeamId: "team-knicks",
      homeTeam: "Toronto Raptors",
      awayTeam: "New York Knicks",
    });
    expect(formatPreviousResult(game, makeTeam())).toBe("TR 112 - 108 NYK");
  });

  it("renders a dash for a missing score", () => {
    expect(
      formatPreviousResult(makeEvent({ awayScore: null }), makeTeam()),
    ).toBe("TR - - 112 NYK");
  });

  it("returns null without a game, a tracked team or a resolved side", () => {
    expect(formatPreviousResult(null, makeTeam())).toBeNull();
    expect(formatPreviousResult(makeEvent(), null)).toBeNull();
    expect(
      formatPreviousResult(
        makeEvent({ leagueId: "other", homeTeam: "Other Team" }),
        makeTeam(),
      ),
    ).toBeNull();
  });
});

describe("GameCardFooter", () => {
  function renderFooter(
    props: {
      showVenue?: boolean;
      previousText?: string | null;
      size?: "compact" | "dense" | "default";
    } = {},
  ): string {
    return renderToStaticMarkup(
      React.createElement(GameCardFooter, {
        size: props.size ?? "compact",
        showVenue: props.showVenue ?? true,
        venueLine: "Scotiabank Arena",
        previousText:
          "previousText" in props
            ? (props.previousText ?? null)
            : "TR 108 - 112 NYK",
      }),
    );
  }

  it("keeps one column and Previous when showVenue is false", () => {
    const html = renderFooter({ showVenue: false });
    expect(html).toContain("grid-cols-1");
    expect(html).not.toContain("divide-x");
    expect(html).not.toContain("Location");
    expect(html).toContain("Previous");
  });

  it("splits into two columns with a divider when showVenue is true", () => {
    const html = renderFooter();
    expect(html).toContain("grid-cols-2 divide-x");
    expect(html).toContain("Location");
  });

  it("renders the shared empty text for a null previous result", () => {
    expect(renderFooter({ previousText: null })).toContain("No previous game");
  });
});

describe("SportLabel", () => {
  function renderLabel(
    sport: string,
    size?: "compact" | "dense" | "default",
  ): string {
    return renderToStaticMarkup(
      React.createElement(SportLabel, { sport, size: size ?? "default" }),
    );
  }

  it("renders the sport text and marker for supported sports", () => {
    for (const sport of ["Basketball", "Baseball", "Ice Hockey"]) {
      const html = renderLabel(sport);
      expect(html).toContain(sport);
      expect(html).toContain("data-sports-sport-label");
    }
  });

  it("renders an unknown sport with a hidden icon", () => {
    const html = renderLabel("Cricket");
    expect(html).toContain("Cricket");
    expect(html).toContain('aria-hidden="true"');
  });

  it("uses the compact icon and text sizes", () => {
    const html = renderLabel("Basketball", "compact");
    expect(html).toContain("text-[11px]");
    expect(html).toContain("h-3 w-3");
  });

  it("uses the default icon and text sizes", () => {
    const html = renderLabel("Basketball");
    expect(html).toContain("text-xs");
    expect(html).toContain("h-3.5 w-3.5");
  });

  it("renders nothing for an empty sport", () => {
    expect(renderLabel("")).toBe("");
  });
});

describe("today cards", () => {
  const today = getLocalDateKey(new Date());
  const current = makeEvent({
    eventId: "evt-current",
    eventDate: today,
    status: "Scheduled",
    homeScore: null,
    awayScore: null,
  });
  const previous = makeEvent();

  it("renders the shared sport chip in the compact view", () => {
    const html = renderToStaticMarkup(
      React.createElement(CompactSportsView, {
        events: [current],
        teams: [makeTeam()],
        teamEventsById: {},
        selectedGameId: current.eventId,
        onSelectGame: () => {},
        showTime: true,
      }),
    );
    expect(html).toContain("data-sports-sport-label");
  });

  it("renders the shared previous result and sport chip in the medium view", () => {
    const html = renderToStaticMarkup(
      React.createElement(MediumLiveGameView, {
        events: [current],
        teams: [makeTeam()],
        teamEventsById: { "team-raptors": { last: [previous], next: [] } },
        selectedGameId: current.eventId,
        onSelectGame: () => {},
      }),
    );
    expect(html).toContain("TR 108 - 112 NYK");
    expect(html).toContain("data-sports-sport-label");
  });
});
