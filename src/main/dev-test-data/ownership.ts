import type Database from "better-sqlite3";
import { REDDIT_DIGEST_FIXTURE_IDS } from "./definitions/reddit-digest";
import { SAVED_POST_FIXTURE_IDS } from "./definitions/saved-posts";
import {
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_LEAGUE_IDS,
  SPORTS_FIXTURE_TEAM_IDS,
} from "./definitions/sports";
import { WEATHER_FIXTURE_LOCATION_ID } from "./definitions/weather";
import {
  YOUTUBE_FIXTURE_CHANNEL_IDS,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "./definitions/youtube";

// This exact namespace is reserved for local fixtures; GLOB treats underscores literally.
export const FIXTURE_ID_GLOB = "pn_dev_fixture_*";

const OWNED_TABLES = [
  {
    table: "yt_videos",
    key: "video_id",
    ids: YOUTUBE_FIXTURE_VIDEO_IDS,
    mutable: ["watched_at"],
  },
  {
    table: "yt_channels",
    key: "channel_id",
    ids: YOUTUBE_FIXTURE_CHANNEL_IDS,
    mutable: [
      "enabled",
      "sort_order",
      "notify_new_videos",
      "notify_live_start",
      "added_at",
    ],
  },
  {
    table: "sports_events",
    key: "event_id",
    ids: SPORTS_FIXTURE_EVENT_IDS,
    mutable: [],
  },
  {
    table: "sports_teams",
    key: "team_id",
    ids: SPORTS_FIXTURE_TEAM_IDS,
    mutable: ["enabled", "sort_order", "added_at"],
  },
  {
    table: "sports_leagues",
    key: "league_id",
    ids: SPORTS_FIXTURE_LEAGUE_IDS,
    mutable: ["enabled", "sort_order", "added_at"],
  },
  {
    table: "sports_opponent_cache",
    key: "team_id",
    ids: SPORTS_FIXTURE_TEAM_IDS,
    mutable: [],
  },
  {
    table: "astronomy_cache",
    key: "location_id",
    ids: [WEATHER_FIXTURE_LOCATION_ID],
    mutable: [],
  },
  {
    table: "weather_alert_state",
    key: "location_id",
    ids: [WEATHER_FIXTURE_LOCATION_ID],
    mutable: ["last_notified_at"],
  },
  {
    table: "weather_cache",
    key: "location_id",
    ids: [WEATHER_FIXTURE_LOCATION_ID],
    mutable: [],
  },
  {
    table: "weather_locations",
    key: "id",
    ids: [WEATHER_FIXTURE_LOCATION_ID],
    mutable: ["created_at"],
  },
  {
    table: "saved_posts",
    key: "post_id",
    ids: SAVED_POST_FIXTURE_IDS,
    mutable: ["tags", "note", "viewed_at", "saved_at"],
  },
  {
    table: "reddit_digest_posts",
    key: "post_id",
    ids: REDDIT_DIGEST_FIXTURE_IDS,
    mutable: ["viewed_at"],
  },
] as const;

function removalPredicate(
  key: string,
  ids: readonly string[],
  retiredOnly: boolean,
): { sql: string; params: string[] } {
  return {
    sql: `${key} GLOB ?${retiredOnly && ids.length ? ` AND ${key} NOT IN (${ids.map(() => "?").join(",")})` : ""}`,
    params: [FIXTURE_ID_GLOB, ...(retiredOnly ? ids : [])],
  };
}

export function clearOwnedFixtureRows(
  database: Database.Database,
  retiredOnly = false,
): void {
  const channel = removalPredicate(
    "channel_id",
    YOUTUBE_FIXTURE_CHANNEL_IDS,
    retiredOnly,
  );
  if (
    database
      .prepare(
        `SELECT video_id FROM yt_videos WHERE video_id NOT GLOB ? AND channel_id IN (SELECT channel_id FROM yt_channels WHERE ${channel.sql}) LIMIT 1`,
      )
      .get(FIXTURE_ID_GLOB, ...channel.params)
  ) {
    throw new Error(
      "Cannot clear test YouTube data while non-fixture videos reference a fixture channel.",
    );
  }
  const league = removalPredicate(
    "league_id",
    SPORTS_FIXTURE_LEAGUE_IDS,
    retiredOnly,
  );
  const team = removalPredicate(
    "team_id",
    SPORTS_FIXTURE_TEAM_IDS,
    retiredOnly,
  );
  if (
    database
      .prepare(
        `SELECT team_id FROM sports_teams WHERE team_id NOT GLOB ? AND league_id IN (SELECT league_id FROM sports_leagues WHERE ${league.sql}) LIMIT 1`,
      )
      .get(FIXTURE_ID_GLOB, ...league.params) ||
    database
      .prepare(
        `SELECT event_id FROM sports_events WHERE event_id NOT GLOB ? AND (league_id IN (SELECT league_id FROM sports_leagues WHERE ${league.sql}) OR home_team_id IN (SELECT team_id FROM sports_teams WHERE ${team.sql}) OR away_team_id IN (SELECT team_id FROM sports_teams WHERE ${team.sql})) LIMIT 1`,
      )
      .get(FIXTURE_ID_GLOB, ...league.params, ...team.params, ...team.params)
  ) {
    throw new Error(
      "Cannot clear test sports data while non-fixture records reference its league or teams.",
    );
  }
  for (const scope of OWNED_TABLES) {
    const predicate = removalPredicate(scope.key, scope.ids, retiredOnly);
    database
      .prepare(`DELETE FROM ${scope.table} WHERE ${predicate.sql}`)
      .run(...predicate.params);
  }
}

// Only interaction/preferences columns are restored; content follows current definitions.
export function captureFixtureInteractions(
  database: Database.Database,
): () => void {
  const snapshots = OWNED_TABLES.filter((scope) => scope.mutable.length).map(
    (scope) => ({
      scope,
      rows: database
        .prepare(
          `SELECT ${scope.key}, ${scope.mutable.join(",")} FROM ${scope.table} WHERE ${scope.key} GLOB ?`,
        )
        .all(FIXTURE_ID_GLOB) as Record<string, unknown>[],
    }),
  );
  return () => {
    for (const { scope, rows } of snapshots) {
      const restore = database.prepare(
        `UPDATE ${scope.table} SET ${scope.mutable.map((column) => `${column} = @${column}`).join(",")} WHERE ${scope.key} = @${scope.key}`,
      );
      for (const row of rows) restore.run(row);
    }
  };
}
