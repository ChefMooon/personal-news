import type { SportEvent } from "../../shared/ipc-types";
import {
  getLeagueById,
  upsertEvents,
  upsertLeague,
  upsertTrackedTeam,
} from "../sources/sports/cache";
import { fixtureDate } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const SPORTS_FIXTURE_LEAGUE_ID = "pn_dev_fixture_sports_league";
export const SPORTS_FIXTURE_HOME_TEAM_ID = "pn_dev_fixture_sports_home";
export const SPORTS_FIXTURE_AWAY_TEAM_ID = "pn_dev_fixture_sports_away";
export const SPORTS_FIXTURE_EVENT_IDS = [
  "pn_dev_fixture_sports_completed",
  "pn_dev_fixture_sports_live",
  "pn_dev_fixture_sports_upcoming",
] as const;

function getFixtureEvents(): SportEvent[] {
  return [
    {
      eventId: SPORTS_FIXTURE_EVENT_IDS[0],
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      homeTeamId: SPORTS_FIXTURE_HOME_TEAM_ID,
      awayTeamId: SPORTS_FIXTURE_AWAY_TEAM_ID,
      homeTeam: "Fixture Owls",
      awayTeam: "Fixture Comets",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: "3",
      awayScore: "1",
      eventDate: fixtureDate(-1),
      eventTime: "19:00",
      status: "FT",
      venue: "Synthetic Arena",
    },
    {
      eventId: SPORTS_FIXTURE_EVENT_IDS[1],
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      homeTeamId: SPORTS_FIXTURE_HOME_TEAM_ID,
      awayTeamId: SPORTS_FIXTURE_AWAY_TEAM_ID,
      homeTeam: "Fixture Owls",
      awayTeam: "Fixture Comets",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: "1",
      awayScore: "1",
      eventDate: fixtureDate(),
      eventTime: "12:00",
      status: "LIVE",
      venue: "Synthetic Arena",
    },
    {
      eventId: SPORTS_FIXTURE_EVENT_IDS[2],
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      homeTeamId: SPORTS_FIXTURE_HOME_TEAM_ID,
      awayTeamId: SPORTS_FIXTURE_AWAY_TEAM_ID,
      homeTeam: "Fixture Owls",
      awayTeam: "Fixture Comets",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: null,
      awayScore: null,
      eventDate: fixtureDate(1),
      eventTime: "19:30",
      status: "NS",
      venue: "Synthetic Arena",
    },
  ];
}

export const sportsFixtureContributor: DevTestDataContributor = {
  id: "sports",
  seed(database): void {
    upsertLeague(database, {
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      name: "Synthetic Demonstration League",
      country: "Synthetic",
      logoUrl: null,
      enabled: true,
    });
    upsertTrackedTeam(database, {
      teamId: SPORTS_FIXTURE_HOME_TEAM_ID,
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      name: "Fixture Owls",
      shortName: "OWL",
      badgeUrl: null,
    });
    upsertTrackedTeam(database, {
      teamId: SPORTS_FIXTURE_AWAY_TEAM_ID,
      leagueId: SPORTS_FIXTURE_LEAGUE_ID,
      sport: "Fixture League",
      name: "Fixture Comets",
      shortName: "COM",
      badgeUrl: null,
    });
    upsertEvents(database, getFixtureEvents(), fixtureDate());
  },
  clear(database): void {
    const placeholders = SPORTS_FIXTURE_EVENT_IDS.map(() => "?").join(", ");
    const nonFixtureTeam = database
      .prepare(
        `SELECT team_id FROM sports_teams
          WHERE league_id = ? AND team_id NOT IN (?, ?)
          LIMIT 1`,
      )
      .get(
        SPORTS_FIXTURE_LEAGUE_ID,
        SPORTS_FIXTURE_HOME_TEAM_ID,
        SPORTS_FIXTURE_AWAY_TEAM_ID,
      );
    const nonFixtureEvent = database
      .prepare(
        `SELECT event_id FROM sports_events
          WHERE league_id = ? AND event_id NOT IN (${placeholders})
          LIMIT 1`,
      )
      .get(SPORTS_FIXTURE_LEAGUE_ID, ...SPORTS_FIXTURE_EVENT_IDS);
    if (nonFixtureTeam || nonFixtureEvent) {
      throw new Error(
        "Cannot clear test sports data while non-fixture records reference its league.",
      );
    }

    database
      .prepare(`DELETE FROM sports_events WHERE event_id IN (${placeholders})`)
      .run(...SPORTS_FIXTURE_EVENT_IDS);
    database
      .prepare("DELETE FROM sports_teams WHERE team_id IN (?, ?)")
      .run(SPORTS_FIXTURE_HOME_TEAM_ID, SPORTS_FIXTURE_AWAY_TEAM_ID);
    if (getLeagueById(database, SPORTS_FIXTURE_LEAGUE_ID)) {
      database
        .prepare("DELETE FROM sports_leagues WHERE league_id = ?")
        .run(SPORTS_FIXTURE_LEAGUE_ID);
    }
  },
};
