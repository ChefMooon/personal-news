import type Database from "better-sqlite3";
import type {
  SportEvent,
  SportLeague,
  SportSyncStatus,
  SportTeamEvents,
  TrackedTeam,
} from "../../../shared/ipc-types";
import {
  classifySportEventState,
  getLocalDateKey,
  getSportEventLocalDateKey,
  shiftLocalDateKey,
} from "../../../shared/sports-event-utils";
import { isFinalSportEvent } from "./status";

type UpsertLeagueInput = {
  leagueId: string;
  sport: string;
  name: string;
  country: string | null;
  logoUrl: string | null;
  enabled?: boolean;
};

type UpsertTeamInput = {
  teamId: string;
  leagueId: string;
  sport: string;
  name: string;
  shortName: string | null;
  badgeUrl: string | null;
};

type LeagueRow = {
  league_id: string;
  sport: string;
  name: string;
  country: string | null;
  logo_url: string | null;
  enabled: number;
  sort_order: number;
};

type TeamRow = {
  team_id: string;
  league_id: string;
  sport: string;
  name: string;
  short_name: string | null;
  badge_url: string | null;
  enabled: number;
  sort_order: number;
};

type EventRow = {
  event_id: string;
  league_id: string;
  sport: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team: string;
  away_team: string;
  home_team_badge_url?: string | null;
  away_team_badge_url?: string | null;
  home_score: string | null;
  away_score: string | null;
  event_date: string;
  event_time: string | null;
  status: string | null;
  venue: string | null;
  venue_city: string | null;
  venue_region: string | null;
  venue_country: string | null;
};

function mapLeague(row: LeagueRow): SportLeague {
  return {
    leagueId: row.league_id,
    sport: row.sport,
    name: row.name,
    country: row.country,
    logoUrl: row.logo_url,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
  };
}

function mapTeam(row: TeamRow): TrackedTeam {
  return {
    teamId: row.team_id,
    leagueId: row.league_id,
    sport: row.sport,
    name: row.name,
    shortName: row.short_name,
    badgeUrl: row.badge_url,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
  };
}

function mapEvent(row: EventRow): SportEvent {
  return {
    eventId: row.event_id,
    leagueId: row.league_id,
    sport: row.sport,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeTeamBadgeUrl: row.home_team_badge_url ?? null,
    awayTeamBadgeUrl: row.away_team_badge_url ?? null,
    homeScore: row.home_score,
    awayScore: row.away_score,
    eventDate: row.event_date,
    eventTime: row.event_time,
    status: row.status,
    venue: row.venue,
    venueCity: row.venue_city,
    venueRegion: row.venue_region,
    venueCountry: row.venue_country,
  };
}

function eventSortValue(event: SportEvent): number {
  const time = event.eventTime ? `${event.eventTime}:00` : "12:00:00";
  const value = Date.parse(`${event.eventDate}T${time}Z`);
  return Number.isNaN(value) ? 0 : value;
}

export function getLastTeamEvents(
  events: SportEvent[],
  today: string,
): SportEvent[] {
  return events
    .filter((event) => {
      const eventLocalDate =
        getSportEventLocalDateKey(event.eventDate, event.eventTime) ??
        event.eventDate;
      return eventLocalDate <= today && isFinalSportEvent(event);
    })
    .sort((a, b) => eventSortValue(b) - eventSortValue(a))
    .slice(0, 5);
}

export function normalizeTeamLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getMatchSignature(event: SportEvent): string {
  return [
    event.sport,
    event.leagueId,
    event.eventDate,
    event.eventTime ?? "",
    normalizeTeamLookupKey(event.homeTeam),
    normalizeTeamLookupKey(event.awayTeam),
  ].join("|");
}

function getEventQualityScore(event: SportEvent): number {
  const state = classifySportEventState({
    status: event.status,
    homeScore: event.homeScore,
    awayScore: event.awayScore,
    eventDate: event.eventDate,
    eventTime: event.eventTime,
  });
  const stateScore =
    state === "final"
      ? 30
      : state === "live"
        ? 20
        : state === "scheduled"
          ? 10
          : 0;
  const hasScore =
    event.homeScore != null &&
    event.homeScore !== "" &&
    event.awayScore != null &&
    event.awayScore !== "";
  const scoreBonus = hasScore ? 5 : 0;
  const providerBonus = event.eventId.startsWith("espn:") ? 1 : 0;
  return stateScore + scoreBonus + providerBonus;
}

function dedupeEventsByMatch(
  events: SportEvent[],
  signatureForEvent: (event: SportEvent) => string = getMatchSignature,
): SportEvent[] {
  const bySignature = new Map<string, SportEvent>();
  for (const event of events) {
    const signature = signatureForEvent(event);
    const existing = bySignature.get(signature);
    if (!existing) {
      bySignature.set(signature, event);
      continue;
    }

    if (getEventQualityScore(event) >= getEventQualityScore(existing)) {
      bySignature.set(signature, event);
    }
  }

  return Array.from(bySignature.values());
}

function getBadgeCacheKey(sport: string, leagueId: string): string {
  return `badge:${sport}:${leagueId}`;
}

export function getLocalDateString(date = new Date()): string {
  return getLocalDateKey(date);
}

export function getAdjacentLocalDateKeys(
  date: string,
): [string, string, string] {
  return [shiftLocalDateKey(date, -1), date, shiftLocalDateKey(date, 1)];
}

export function listLeagues(
  db: Database.Database,
  sport: string,
): SportLeague[] {
  const rows = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE sport = ?
        ORDER BY enabled DESC, sort_order ASC, name COLLATE NOCASE ASC`,
    )
    .all(sport) as LeagueRow[];

  return rows.map(mapLeague);
}

export function getLeagueById(
  db: Database.Database,
  leagueId: string,
): SportLeague | null {
  const row = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE league_id = ?`,
    )
    .get(leagueId) as LeagueRow | undefined;

  return row ? mapLeague(row) : null;
}

export function listEnabledLeagues(
  db: Database.Database,
  sport: string,
): SportLeague[] {
  const rows = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE sport = ? AND enabled = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
    )
    .all(sport) as LeagueRow[];

  return rows.map(mapLeague);
}

export function upsertLeague(
  db: Database.Database,
  input: UpsertLeagueInput,
): SportLeague {
  const addedAt = Math.floor(Date.now() / 1000);
  const nextSortOrder =
    (
      db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM sports_leagues WHERE sport = ?",
        )
        .get(input.sport) as { max_sort: number }
    ).max_sort + 1;

  db.prepare(
    `INSERT INTO sports_leagues (league_id, sport, name, country, logo_url, enabled, sort_order, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET
       sport = excluded.sport,
       name = excluded.name,
       country = excluded.country,
       logo_url = excluded.logo_url`,
  ).run(
    input.leagueId,
    input.sport,
    input.name,
    input.country,
    input.logoUrl,
    input.enabled === true ? 1 : 0,
    nextSortOrder,
    addedAt,
  );

  return getLeagueById(db, input.leagueId) as SportLeague;
}

export function setLeagueEnabled(
  db: Database.Database,
  leagueId: string,
  enabled: boolean,
): boolean {
  const result = db
    .prepare("UPDATE sports_leagues SET enabled = ? WHERE league_id = ?")
    .run(enabled ? 1 : 0, leagueId);
  return result.changes > 0;
}

export function listTrackedTeams(
  db: Database.Database,
  sport?: string,
): TrackedTeam[] {
  const rows = (
    sport
      ? db
          .prepare(
            `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
           FROM sports_teams
          WHERE sport = ?
          ORDER BY sort_order ASC, name COLLATE NOCASE ASC`,
          )
          .all(sport)
      : db
          .prepare(
            `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
           FROM sports_teams
          ORDER BY sport ASC, sort_order ASC, name COLLATE NOCASE ASC`,
          )
          .all()
  ) as TeamRow[];

  return rows.map(mapTeam);
}

export function getTrackedTeam(
  db: Database.Database,
  teamId: string,
): TrackedTeam | null {
  const row = db
    .prepare(
      `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
         FROM sports_teams
        WHERE team_id = ?`,
    )
    .get(teamId) as TeamRow | undefined;

  return row ? mapTeam(row) : null;
}

function ensureLeagueRowExists(
  db: Database.Database,
  sport: string,
  leagueId: string,
): void {
  if (getLeagueById(db, leagueId)) {
    return;
  }

  upsertLeague(db, {
    leagueId,
    sport,
    name: leagueId,
    country: null,
    logoUrl: null,
    enabled: true,
  });
}

export function upsertTrackedTeam(
  db: Database.Database,
  input: UpsertTeamInput,
): TrackedTeam {
  ensureLeagueRowExists(db, input.sport, input.leagueId);

  const addedAt = Math.floor(Date.now() / 1000);
  const nextSortOrder =
    (
      db
        .prepare(
          "SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM sports_teams WHERE sport = ?",
        )
        .get(input.sport) as { max_sort: number }
    ).max_sort + 1;

  db.prepare(
    `INSERT INTO sports_teams (team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order, added_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET
       league_id = excluded.league_id,
       sport = excluded.sport,
       name = excluded.name,
       short_name = excluded.short_name,
       badge_url = excluded.badge_url`,
  ).run(
    input.teamId,
    input.leagueId,
    input.sport,
    input.name,
    input.shortName,
    input.badgeUrl,
    nextSortOrder,
    addedAt,
  );

  return getTrackedTeam(db, input.teamId) as TrackedTeam;
}

export function removeTrackedTeam(
  db: Database.Database,
  teamId: string,
): boolean {
  const result = db
    .prepare("DELETE FROM sports_teams WHERE team_id = ?")
    .run(teamId);
  return result.changes > 0;
}

export function setTrackedTeamEnabled(
  db: Database.Database,
  teamId: string,
  enabled: boolean,
): boolean {
  const result = db
    .prepare("UPDATE sports_teams SET enabled = ? WHERE team_id = ?")
    .run(enabled ? 1 : 0, teamId);
  return result.changes > 0;
}

export function setTrackedTeamOrder(
  db: Database.Database,
  orderedIds: string[],
): void {
  const update = db.prepare(
    "UPDATE sports_teams SET sort_order = ? WHERE team_id = ?",
  );
  const apply = db.transaction((ids: string[]) => {
    ids.forEach((teamId, index) => {
      update.run(index, teamId);
    });
  });

  apply(orderedIds);
}

export function upsertEvents(
  db: Database.Database,
  events: SportEvent[],
  fetchedDate: string,
  shouldPersist: () => boolean = () => true,
): void {
  if (events.length === 0 || !shouldPersist()) {
    return;
  }

  for (const event of events) {
    ensureLeagueRowExists(db, event.sport, event.leagueId);
  }

  const insert = db.prepare(
    `INSERT INTO sports_events (
       event_id, league_id, sport, home_team_id, away_team_id,
       home_team, away_team, home_team_normalized, away_team_normalized, home_score, away_score,
       event_date, event_time, status, venue, venue_city, venue_region, venue_country, fetched_date
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       league_id = excluded.league_id,
       sport = excluded.sport,
       home_team_id = excluded.home_team_id,
       away_team_id = excluded.away_team_id,
       home_team = excluded.home_team,
       away_team = excluded.away_team,
       home_team_normalized = excluded.home_team_normalized,
       away_team_normalized = excluded.away_team_normalized,
       home_score = excluded.home_score,
       away_score = excluded.away_score,
       event_date = excluded.event_date,
       event_time = excluded.event_time,
       status = excluded.status,
       venue = excluded.venue,
       venue_city = excluded.venue_city,
       venue_region = excluded.venue_region,
       venue_country = excluded.venue_country,
       fetched_date = excluded.fetched_date`,
  );

  const apply = db.transaction((items: SportEvent[]) => {
    if (!shouldPersist()) {
      return;
    }
    for (const event of items) {
      const homeTeamNormalized = normalizeTeamLookupKey(event.homeTeam);
      const awayTeamNormalized = normalizeTeamLookupKey(event.awayTeam);

      insert.run(
        event.eventId,
        event.leagueId,
        event.sport,
        event.homeTeamId,
        event.awayTeamId,
        event.homeTeam,
        event.awayTeam,
        homeTeamNormalized,
        awayTeamNormalized,
        event.homeScore,
        event.awayScore,
        event.eventDate,
        event.eventTime,
        event.status,
        event.venue,
        event.venueCity ?? null,
        event.venueRegion ?? null,
        event.venueCountry ?? null,
        fetchedDate,
      );
    }
  });

  apply(events);
}

export function clearOpponentCache(db: Database.Database): void {
  db.prepare("DELETE FROM sports_opponent_cache").run();
}

export function getOpponentBadge(
  db: Database.Database,
  teamId: string,
): string | null | undefined {
  const row = db
    .prepare("SELECT badge_url FROM sports_opponent_cache WHERE team_id = ?")
    .get(teamId) as { badge_url: string | null } | undefined;

  return row === undefined ? undefined : row.badge_url;
}

export function upsertOpponentBadge(
  db: Database.Database,
  teamId: string,
  name: string,
  badgeUrl: string | null,
): void {
  db.prepare(
    `INSERT INTO sports_opponent_cache (team_id, name, badge_url, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET
       name = excluded.name,
       badge_url = excluded.badge_url,
       fetched_at = excluded.fetched_at`,
  ).run(teamId, name, badgeUrl, Math.floor(Date.now() / 1000));
}

export function getCachedEvent(
  db: Database.Database,
  eventId: string,
): SportEvent | null {
  const row = db
    .prepare(
      `SELECT se.event_id, se.league_id, se.sport, se.home_team_id, se.away_team_id,
            se.home_team, se.away_team,
            ht.badge_url AS home_team_badge_url, at.badge_url AS away_team_badge_url,
            se.home_score, se.away_score, se.event_date, se.event_time, se.status, se.venue,
            se.venue_city, se.venue_region, se.venue_country
       FROM sports_events se
       LEFT JOIN sports_teams ht ON ht.team_id = se.home_team_id
       LEFT JOIN sports_teams at ON at.team_id = se.away_team_id
      WHERE se.event_id = ?`,
    )
    .get(eventId) as EventRow | undefined;
  return row ? mapEvent(row) : null;
}

export function getTodayEvents(
  db: Database.Database,
  sport: string,
  date: string,
): SportEvent[] {
  const [previousDate, currentDate, nextDate] = getAdjacentLocalDateKeys(date);
  const rows = db
    .prepare(
      `SELECT se.event_id, se.league_id, se.sport, se.home_team_id, se.away_team_id,
              se.home_team, se.away_team,
              COALESCE(ht.badge_url, hoc.badge_url) AS home_team_badge_url,
              COALESCE(at.badge_url, aoc.badge_url) AS away_team_badge_url,
              se.home_score, se.away_score,
              se.event_date, se.event_time, se.status, se.venue,
              se.venue_city, se.venue_region, se.venue_country
         FROM sports_events se
         INNER JOIN sports_leagues sl ON sl.league_id = se.league_id
         LEFT JOIN sports_teams ht ON ht.team_id = se.home_team_id
         LEFT JOIN sports_teams at ON at.team_id = se.away_team_id
         LEFT JOIN sports_opponent_cache hoc ON hoc.team_id = se.home_team_id
         LEFT JOIN sports_opponent_cache aoc ON aoc.team_id = se.away_team_id
        WHERE se.sport = ?
          AND se.event_date IN (?, ?, ?)
          AND sl.enabled = 1
        ORDER BY sl.sort_order ASC, se.event_time ASC, se.home_team COLLATE NOCASE ASC`,
    )
    .all(sport, previousDate, currentDate, nextDate) as EventRow[];

  // Phase 4 Fix: Use game start time for fetch-date key, not current time
  // This ensures games crossing midnight stay in their correct cache date.
  // Also dedupe by matchup signature so the Sports page + widget prefer the
  // freshest provider row (live > scheduled, scored > unscored, ESPN > SportsDB)
  // instead of surfacing a stale SportsDB record alongside a live ESPN one.
  const filtered = rows
    .map(mapEvent)
    .filter(
      (event) =>
        getSportEventLocalDateKey(event.eventDate, event.eventTime) === date,
    );
  const identitiesByLeague = new Map(
    [...new Set(filtered.map((event) => event.leagueId))].map((leagueId) => [
      leagueId, getLeagueSnapshot(db, sport, leagueId).identities,
    ]),
  );
  const deduped = [...new Set(filtered.map((event) => event.leagueId))].flatMap((leagueId) => {
    const identities = identitiesByLeague.get(leagueId) ?? new Map<string, string>();
    return dedupeProviderEvents(filtered.filter((event) => event.leagueId === leagueId), identities)
      .map((event) => withProviderIdentities(event, identities));
  });
  const order = new Map(filtered.map((event, index) => [event.eventId, index]));
  return deduped.sort((a, b) => order.get(a.eventId)! - order.get(b.eventId)!);
}

function withProviderIdentities(event: SportEvent, identities: Map<string, string>): SportEvent {
  const home = event.homeTeamId ? identities.get(event.homeTeamId) : undefined;
  const away = event.awayTeamId ? identities.get(event.awayTeamId) : undefined;
  if (home && home === away) return { ...event };
  const trackedTeamIdentities: NonNullable<SportEvent["trackedTeamIdentities"]> = [];
  if (home) trackedTeamIdentities.push({ teamId: home, side: "home" });
  if (away) trackedTeamIdentities.push({ teamId: away, side: "away" });
  return trackedTeamIdentities.length ? { ...event, trackedTeamIdentities } : { ...event };
}

// Infer provider identities only from uniquely paired games with the same kickoff
// and opponent. A name fragment alone is not a reliable team identity.
function getProviderTeamIds(events: SportEvent[]): Map<string, string> {
  const sportsDbEvents = events.filter(
    (event) => !event.eventId.startsWith("espn:"),
  );
  const espnEvents = events.filter((event) =>
    event.eventId.startsWith("espn:"),
  );
  // Index by kickoff and exact side name; inspect at most two distinct matches
  // because any additional match makes the pairing ambiguous.
  const indexEvents = (items: SportEvent[]): Map<string, SportEvent[]> => {
    const index = new Map<string, SportEvent[]>();
    for (const event of items) {
      if (!event.eventTime) continue;
      for (const side of ["home", "away"] as const) {
        const name = normalizeTeamLookupKey(side === "home" ? event.homeTeam : event.awayTeam);
        if (!name) continue;
        const key = JSON.stringify([event.sport, event.leagueId, event.eventDate, event.eventTime, side, name]);
        const matches = index.get(key) ?? [];
        // Two entries are enough to establish ambiguity.
        if (matches.length < 2) matches.push(event);
        index.set(key, matches);
      }
    }
    return index;
  };
  const sourceIndex = indexEvents(sportsDbEvents);
  const espnIndex = indexEvents(espnEvents);
  const findMatches = (event: SportEvent, index: Map<string, SportEvent[]>): SportEvent[] => {
    if (!event.eventTime) return [];
    const matches = new Set<SportEvent>();
    for (const side of ["home", "away"] as const) {
      const name = normalizeTeamLookupKey(side === "home" ? event.homeTeam : event.awayTeam);
      if (!name) continue;
      const key = JSON.stringify([event.sport, event.leagueId, event.eventDate, event.eventTime, side, name]);
      for (const match of index.get(key) ?? []) matches.add(match);
    }
    return [...matches];
  };

  const sourceToEspn = new Map<string, Set<string>>();
  const espnToSource = new Map<string, Set<string>>();
  for (const source of sportsDbEvents) {
    const matches = findMatches(source, espnIndex);
    if (matches.length !== 1 || findMatches(matches[0], sourceIndex).length !== 1) continue;
    const espn = matches[0];
    for (const [sourceId, espnId] of [
      [source.homeTeamId, espn.homeTeamId],
      [source.awayTeamId, espn.awayTeamId],
    ]) {
      if (!sourceId || !espnId) continue;
      const targets = sourceToEspn.get(sourceId) ?? new Set<string>();
      targets.add(espnId);
      sourceToEspn.set(sourceId, targets);
      const sources = espnToSource.get(espnId) ?? new Set<string>();
      sources.add(sourceId);
      espnToSource.set(espnId, sources);
    }
  }
  const identities = new Map<string, string>();
  for (const [sourceId, matches] of sourceToEspn) {
    if (matches.size !== 1) continue;
    const espnId = [...matches][0];
    if (espnToSource.get(espnId)?.size === 1) identities.set(espnId, sourceId);
  }
  return identities;
}

// Pair different provider rows only when their kickoff and at least one side
// agree, and neither row has another possible partner. Known identities can
// establish both sides even when both display names differ.
function dedupeProviderEvents(events: SportEvent[], identities: Map<string, string>): SportEvent[] {
  const exact = dedupeEventsByMatch(events);
  const sources = exact.filter((event) => !event.eventId.startsWith("espn:"));
  const espn = exact.filter((event) => event.eventId.startsWith("espn:"));
  const kickoffKey = (event: SportEvent): string =>
    JSON.stringify([event.sport, event.leagueId, event.eventDate, event.eventTime]);
  const groupByKickoff = (items: SportEvent[]): Map<string, SportEvent[]> => {
    const groups = new Map<string, SportEvent[]>();
    for (const event of items) {
      if (!event.eventTime) continue;
      const key = kickoffKey(event);
      const group = groups.get(key) ?? [];
      group.push(event);
      groups.set(key, group);
    }
    return groups;
  };
  const sourcesByKickoff = groupByKickoff(sources);
  const espnByKickoff = groupByKickoff(espn);
  const matches = (a: SportEvent, b: SportEvent): boolean => {
    if (!a.eventTime || a.eventTime !== b.eventTime || a.eventDate !== b.eventDate ||
        a.sport !== b.sport || a.leagueId !== b.leagueId) return false;
    const sideMatches = (sourceId: string | null, providerId: string | null, sourceName: string, providerName: string): boolean => {
      const mapped = providerId ? identities.get(providerId) : undefined;
      if (mapped && sourceId) return mapped === sourceId;
      const name = normalizeTeamLookupKey(sourceName);
      return !!name && name === normalizeTeamLookupKey(providerName);
    };
    const conflicts = (sourceId: string | null, providerId: string | null): boolean => {
      const mapped = providerId ? identities.get(providerId) : undefined;
      return !!mapped && !!sourceId && mapped !== sourceId;
    };
    if (conflicts(a.homeTeamId, b.homeTeamId) || conflicts(a.awayTeamId, b.awayTeamId)) return false;
    return sideMatches(a.homeTeamId, b.homeTeamId, a.homeTeam, b.homeTeam) ||
      sideMatches(a.awayTeamId, b.awayTeamId, a.awayTeam, b.awayTeam);
  };
  const removed = new Set<SportEvent>();
  for (const source of sources) {
    if (!source.eventTime) continue;
    const key = kickoffKey(source);
    const candidates = (espnByKickoff.get(key) ?? []).filter((event) => matches(source, event));
    if (candidates.length !== 1 || (sourcesByKickoff.get(key) ?? []).filter((event) => matches(event, candidates[0])).length !== 1) continue;
    const candidate = candidates[0];
    removed.add(getEventQualityScore(candidate) >= getEventQualityScore(source) ? source : candidate);
  }
  return exact.filter((event) => !removed.has(event));
}

type LeagueSnapshot = {
  identities: Map<string, string>;
  byTeam: Map<string, SportEvent[]>;
  byName: Map<string, SportEvent[]>;
  order: Map<SportEvent, number>;
};

type SnapshotCache = {
  totalChanges: number;
  dataVersion: number;
  leagues: Map<string, LeagueSnapshot>;
};

// Database objects are profile-specific; weak keys also avoid retaining closed profiles.
const leagueSnapshots = new WeakMap<Database.Database, SnapshotCache>();

function getLeagueSnapshot(db: Database.Database, sport: string, leagueId: string): LeagueSnapshot {
  const totalChanges = (db.prepare("SELECT total_changes() AS count").get() as { count: number }).count;
  const dataVersion = db.pragma("data_version", { simple: true }) as number;
  let cache = leagueSnapshots.get(db);
  // A snapshot read inside a transaction must not survive a rollback.
  if (db.inTransaction || !cache || cache.totalChanges !== totalChanges || cache.dataVersion !== dataVersion) {
    cache = { totalChanges, dataVersion, leagues: new Map() };
    if (db.inTransaction) leagueSnapshots.delete(db);
    else leagueSnapshots.set(db, cache);
  }
  const key = JSON.stringify([sport, leagueId]);
  const existing = cache.leagues.get(key);
  if (existing) return existing;

  const rows = db.prepare(
    `SELECT se.event_id, se.league_id, se.sport, se.home_team_id, se.away_team_id,
            se.home_team, se.away_team,
            COALESCE(ht.badge_url, hoc.badge_url) AS home_team_badge_url,
            COALESCE(at.badge_url, aoc.badge_url) AS away_team_badge_url,
            se.home_score, se.away_score, se.event_date, se.event_time, se.status, se.venue,
            se.venue_city, se.venue_region, se.venue_country
       FROM sports_events se
       LEFT JOIN sports_teams ht ON ht.team_id = se.home_team_id
       LEFT JOIN sports_teams at ON at.team_id = se.away_team_id
       LEFT JOIN sports_opponent_cache hoc ON hoc.team_id = se.home_team_id
       LEFT JOIN sports_opponent_cache aoc ON aoc.team_id = se.away_team_id
      WHERE se.league_id = ? AND se.sport = ?`,
  ).all(leagueId, sport) as EventRow[];
  const events = rows.map(mapEvent);
  const byTeam = new Map<string, SportEvent[]>();
  const byName = new Map<string, SportEvent[]>();
  const add = (index: Map<string, SportEvent[]>, key: string | null, event: SportEvent): void => {
    if (!key) return;
    const matches = index.get(key) ?? [];
    if (matches[matches.length - 1] !== event) matches.push(event);
    index.set(key, matches);
  };
  for (const event of events) {
    add(byTeam, event.homeTeamId, event);
    add(byTeam, event.awayTeamId, event);
    add(byName, normalizeTeamLookupKey(event.homeTeam), event);
    add(byName, normalizeTeamLookupKey(event.awayTeam), event);
  }
  const snapshot = { identities: getProviderTeamIds(events), byTeam, byName, order: new Map(events.map((event, index) => [event, index])) };
  cache.leagues.set(key, snapshot);
  return snapshot;
}

export function getTeamEvents(
  db: Database.Database,
  teamId: string,
  today: string,
): SportTeamEvents {
  const trackedTeam = getTrackedTeam(db, teamId);
  const teamName = trackedTeam?.name ?? null;
  const normalizedTeamName = teamName ? normalizeTeamLookupKey(teamName) : null;

  if (!trackedTeam) return { last: [], next: [] };
  const snapshot = getLeagueSnapshot(db, trackedTeam.sport, trackedTeam.leagueId);
  const identities = snapshot.identities;
  const selectedEvents = new Set(snapshot.byTeam.get(teamId) ?? []);
  for (const [espnId, sourceId] of identities) {
    if (sourceId === teamId) {
      for (const event of snapshot.byTeam.get(espnId) ?? []) selectedEvents.add(event);
    }
  }
  if (normalizedTeamName != null) {
    for (const event of snapshot.byName.get(normalizedTeamName) ?? []) selectedEvents.add(event);
  }
  const events = dedupeProviderEvents([...selectedEvents].sort((a, b) => snapshot.order.get(a)! - snapshot.order.get(b)!), identities);
  const teamEvents = events.map((event) => withProviderIdentities(event, identities));
  const getEventLocalDate = (event: SportEvent): string => {
    return (
      getSportEventLocalDateKey(event.eventDate, event.eventTime) ??
      event.eventDate
    );
  };

  const last = getLastTeamEvents(teamEvents, today);
  const next = teamEvents
    .filter((event) => {
      const eventLocalDate = getEventLocalDate(event);
      return (
        eventLocalDate > today ||
        (eventLocalDate === today && !isFinalSportEvent(event))
      );
    })
    .sort((a, b) => eventSortValue(a) - eventSortValue(b))
    .slice(0, 5);

  return { last, next };
}

export function getCacheMeta(
  db: Database.Database,
  sport: string,
  date: string,
): { fetchedAt: number } | null {
  const row = db
    .prepare(
      `SELECT fetched_at
         FROM sports_cache_meta
        WHERE sport = ? AND fetch_date = ?`,
    )
    .get(sport, date) as { fetched_at: number } | undefined;

  return row ? { fetchedAt: row.fetched_at } : null;
}

export function upsertCacheMeta(
  db: Database.Database,
  sport: string,
  date: string,
  fetchedAt: number,
): void {
  db.prepare(
    `INSERT INTO sports_cache_meta (sport, fetch_date, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(sport, fetch_date) DO UPDATE SET fetched_at = excluded.fetched_at`,
  ).run(sport, date, fetchedAt);
}

export function getBadgeCacheMeta(
  db: Database.Database,
  sport: string,
  leagueId: string,
  date = "badge-sync",
): { fetchedAt: number } | null {
  return getCacheMeta(db, getBadgeCacheKey(sport, leagueId), date);
}

export function upsertBadgeCacheMeta(
  db: Database.Database,
  sport: string,
  leagueId: string,
  fetchedAt: number,
  date = "badge-sync",
): void {
  upsertCacheMeta(db, getBadgeCacheKey(sport, leagueId), date, fetchedAt);
}

export function getSportSyncStatus(
  db: Database.Database,
  sport: string,
): SportSyncStatus {
  const meta = db
    .prepare(
      `SELECT fetch_date, fetched_at
         FROM sports_cache_meta
        WHERE sport = ?
        ORDER BY fetched_at DESC
        LIMIT 1`,
    )
    .get(sport) as { fetch_date: string; fetched_at: number } | undefined;

  const badgeMeta = db
    .prepare(
      `SELECT MAX(fetched_at) AS fetched_at
         FROM sports_cache_meta
        WHERE sport LIKE ? AND fetch_date = ?`,
    )
    .get(`badge:${sport}:%`, "badge-sync") as
    { fetched_at: number | null } | undefined;

  const enabledLeagueCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM sports_leagues WHERE sport = ? AND enabled = 1",
      )
      .get(sport) as { count: number }
  ).count;
  const trackedTeamCount = (
    db
      .prepare("SELECT COUNT(*) AS count FROM sports_teams WHERE sport = ?")
      .get(sport) as { count: number }
  ).count;

  return {
    sport,
    lastFetchedAt: meta?.fetched_at ?? null,
    lastBadgeFetchedAt: badgeMeta?.fetched_at ?? null,
    fetchDate: meta?.fetch_date ?? null,
    enabledLeagueCount,
    trackedTeamCount,
  };
}
