import type { SportEvent } from "../../../shared/ipc-types";
import type { SupportedSport } from "../../../shared/sports";
import { fixtureTimestamp, type FixtureContext } from "../fixtures";

type FixtureTeam = {
  teamId: string;
  name: string;
  shortName: string;
};

type FixtureLeague = {
  sport: SupportedSport;
  leagueId: string;
  name: string;
  home: FixtureTeam;
  away: FixtureTeam;
  venue: string;
  liveDescription: string;
  liveProgress: string;
};

const baseball: FixtureLeague = {
  sport: "Baseball",
  leagueId: "pn_dev_fixture_sports_league",
  name: "Synthetic Demonstration League",
  home: {
    teamId: "pn_dev_fixture_sports_home",
    name: "Fixture Owls",
    shortName: "OWL",
  },
  away: {
    teamId: "pn_dev_fixture_sports_away",
    name: "Fixture Comets",
    shortName: "COM",
  },
  venue: "Synthetic Ballpark",
  liveDescription:
    "Synthetic Baseball game for the Development fixture league.",
  liveProgress: "Top 5th inning",
};

const basketball: FixtureLeague = {
  sport: "Basketball",
  leagueId: "pn_dev_fixture_sports_basketball_league",
  name: "Synthetic Basketball League",
  home: {
    teamId: "pn_dev_fixture_sports_basketball_home",
    name: "Fixture Foxes",
    shortName: "FOX",
  },
  away: {
    teamId: "pn_dev_fixture_sports_basketball_away",
    name: "Fixture Pilots",
    shortName: "PIL",
  },
  venue: "Synthetic Arena",
  liveDescription:
    "Synthetic Basketball game for the Development fixture league.",
  liveProgress: "End of 3rd quarter",
};

export const SPORTS_FIXTURE_LEAGUES = [baseball, basketball] as const;
export const SPORTS_FIXTURE_SPORTS = [
  ...new Set(SPORTS_FIXTURE_LEAGUES.map((league) => league.sport)),
];
export const SPORTS_FIXTURE_LEAGUE_IDS = SPORTS_FIXTURE_LEAGUES.map(
  (league) => league.leagueId,
);
export const SPORTS_FIXTURE_TEAM_IDS = SPORTS_FIXTURE_LEAGUES.flatMap(
  (league) => [league.home.teamId, league.away.teamId],
);
export const SPORTS_FIXTURE_EVENT_IDS = [
  "pn_dev_fixture_sports_completed",
  "pn_dev_fixture_sports_live",
  "pn_dev_fixture_sports_upcoming",
  "pn_dev_fixture_sports_basketball_live",
] as const;

// Preserve the original Baseball exports for existing consumers.
export const SPORTS_FIXTURE_SPORT = baseball.sport;
export const SPORTS_FIXTURE_LEAGUE_ID = baseball.leagueId;
export const SPORTS_FIXTURE_HOME_TEAM_ID = baseball.home.teamId;
export const SPORTS_FIXTURE_AWAY_TEAM_ID = baseball.away.teamId;
export const SPORTS_FIXTURE_BASKETBALL_LEAGUE_ID = basketball.leagueId;
export const SPORTS_FIXTURE_BASKETBALL_HOME_TEAM_ID = basketball.home.teamId;
export const SPORTS_FIXTURE_BASKETBALL_AWAY_TEAM_ID = basketball.away.teamId;
export const SPORTS_FIXTURE_BASKETBALL_SPORT = basketball.sport;

function makeEvent(
  league: FixtureLeague,
  eventId: string,
  eventDate: string,
  eventTime: string,
  status: string,
  homeScore: string | null,
  awayScore: string | null,
): SportEvent {
  return {
    eventId,
    leagueId: league.leagueId,
    sport: league.sport,
    homeTeamId: league.home.teamId,
    awayTeamId: league.away.teamId,
    homeTeam: league.home.name,
    awayTeam: league.away.name,
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore,
    awayScore,
    eventDate,
    eventTime,
    status,
    venue: league.venue,
  };
}

export function getSportsFixtureEventDetail(event: SportEvent): {
  progress: string | null;
  descriptionEN: string;
} {
  const league = SPORTS_FIXTURE_LEAGUES.find(
    (candidate) => candidate.leagueId === event.leagueId,
  );
  return {
    progress: event.status === "LIVE" ? (league?.liveProgress ?? null) : null,
    descriptionEN:
      league?.liveDescription ??
      "Synthetic game for the Development fixture league.",
  };
}

export function buildSportsFixture(context: FixtureContext): SportEvent[] {
  const eventStart = (
    offsetDays: number,
  ): { eventDate: string; eventTime: string } => {
    const start = new Date(
      fixtureTimestamp(context, offsetDays * 86400) * 1000,
    ).toISOString();
    return { eventDate: start.slice(0, 10), eventTime: start.slice(11, 16) };
  };
  const [baseballFixture, basketballFixture] = SPORTS_FIXTURE_LEAGUES;
  const yesterday = eventStart(-1);
  const today = eventStart(0);
  const tomorrow = eventStart(1);
  return [
    makeEvent(
      baseballFixture,
      SPORTS_FIXTURE_EVENT_IDS[0],
      yesterday.eventDate,
      yesterday.eventTime,
      "FT",
      "3",
      "1",
    ),
    makeEvent(
      baseballFixture,
      SPORTS_FIXTURE_EVENT_IDS[1],
      today.eventDate,
      today.eventTime,
      "LIVE",
      "1",
      "1",
    ),
    makeEvent(
      baseballFixture,
      SPORTS_FIXTURE_EVENT_IDS[2],
      tomorrow.eventDate,
      tomorrow.eventTime,
      "NS",
      null,
      null,
    ),
    makeEvent(
      basketballFixture,
      SPORTS_FIXTURE_EVENT_IDS[3],
      today.eventDate,
      today.eventTime,
      "LIVE",
      "62",
      "58",
    ),
  ];
}
