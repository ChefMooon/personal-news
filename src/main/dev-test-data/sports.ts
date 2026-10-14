import {
  getLeagueById,
  upsertEvents,
  upsertLeague,
  upsertTrackedTeam,
} from "../sources/sports/cache";
import {
  buildSportsFixture,
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_LEAGUES,
} from "./definitions/sports";
import {
  createFixtureContext,
  fixtureDate,
  fixtureTimestamp,
  type FixtureContext,
} from "./fixtures";
import type { DevTestDataContributor } from "./types";

export {
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_HOME_TEAM_ID,
  SPORTS_FIXTURE_LEAGUE_ID,
  SPORTS_FIXTURE_SPORT,
} from "./definitions/sports";

export const sportsFixtureContributor: DevTestDataContributor = {
  id: "sports",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    for (const league of SPORTS_FIXTURE_LEAGUES) {
      const existingLeague = database
        .prepare("SELECT league_id FROM sports_leagues WHERE league_id = ?")
        .get(league.leagueId);
      const existingTeams = new Set(
        (
          database
            .prepare("SELECT team_id FROM sports_teams WHERE team_id IN (?, ?)")
            .all(league.home.teamId, league.away.teamId) as {
            team_id: string;
          }[]
        ).map((row) => row.team_id),
      );
      upsertLeague(database, {
        leagueId: league.leagueId,
        sport: league.sport,
        name: league.name,
        country: "Synthetic",
        logoUrl: null,
        enabled: true,
      });
      for (const team of [league.home, league.away]) {
        upsertTrackedTeam(database, {
          teamId: team.teamId,
          leagueId: league.leagueId,
          sport: league.sport,
          name: team.name,
          shortName: team.shortName,
          badgeUrl: null,
        });
        if (!existingTeams.has(team.teamId))
          database
            .prepare("UPDATE sports_teams SET added_at = ? WHERE team_id = ?")
            .run(fixtureTimestamp(context), team.teamId);
      }
      if (!existingLeague)
        database
          .prepare("UPDATE sports_leagues SET added_at = ? WHERE league_id = ?")
          .run(fixtureTimestamp(context), league.leagueId);
    }
    upsertEvents(database, buildSportsFixture(context), fixtureDate(context));
  },
  clear(database): void {
    const eventPlaceholders = SPORTS_FIXTURE_EVENT_IDS.map(() => "?").join(
      ", ",
    );
    const leagueIds = SPORTS_FIXTURE_LEAGUES.map((league) => league.leagueId);
    const teamIds = SPORTS_FIXTURE_LEAGUES.flatMap((league) => [
      league.home.teamId,
      league.away.teamId,
    ]);
    const leaguePlaceholders = leagueIds.map(() => "?").join(", ");
    const teamPlaceholders = teamIds.map(() => "?").join(", ");
    const nonFixtureTeam = database
      .prepare(
        `SELECT team_id FROM sports_teams WHERE league_id IN (${leaguePlaceholders}) AND team_id NOT IN (${teamPlaceholders}) LIMIT 1`,
      )
      .get(...leagueIds, ...teamIds);
    const nonFixtureEvent = database
      .prepare(
        `SELECT event_id FROM sports_events WHERE (league_id IN (${leaguePlaceholders}) OR home_team_id IN (${teamPlaceholders}) OR away_team_id IN (${teamPlaceholders})) AND event_id NOT IN (${eventPlaceholders}) LIMIT 1`,
      )
      .get(...leagueIds, ...teamIds, ...teamIds, ...SPORTS_FIXTURE_EVENT_IDS);
    if (nonFixtureTeam || nonFixtureEvent)
      throw new Error(
        "Cannot clear test sports data while non-fixture records reference its leagues or teams.",
      );
    database
      .prepare(
        `DELETE FROM sports_events WHERE event_id IN (${eventPlaceholders})`,
      )
      .run(...SPORTS_FIXTURE_EVENT_IDS);
    database
      .prepare(
        `DELETE FROM sports_teams WHERE team_id IN (${teamPlaceholders})`,
      )
      .run(...teamIds);
    for (const leagueId of leagueIds) {
      if (getLeagueById(database, leagueId))
        database
          .prepare("DELETE FROM sports_leagues WHERE league_id = ?")
          .run(leagueId);
    }
  },
};
