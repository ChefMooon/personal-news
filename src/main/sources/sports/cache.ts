import type Database from 'better-sqlite3'
import type {
  SportEvent,
  SportLeague,
  SportSyncStatus,
  SportTeamEvents,
  TrackedTeam
} from '../../../shared/ipc-types'

type UpsertLeagueInput = {
  leagueId: string
  sport: string
  name: string
  country: string | null
  logoUrl: string | null
  enabled?: boolean
}

type UpsertTeamInput = {
  teamId: string
  leagueId: string
  sport: string
  name: string
  shortName: string | null
  badgeUrl: string | null
}

type LeagueRow = {
  league_id: string
  sport: string
  name: string
  country: string | null
  logo_url: string | null
  enabled: number
  sort_order: number
}

type TeamRow = {
  team_id: string
  league_id: string
  sport: string
  name: string
  short_name: string | null
  badge_url: string | null
  enabled: number
  sort_order: number
}

type EventRow = {
  event_id: string
  league_id: string
  sport: string
  home_team_id: string | null
  away_team_id: string | null
  home_team: string
  away_team: string
  home_score: string | null
  away_score: string | null
  event_date: string
  event_time: string | null
  status: string | null
  venue: string | null
}

function mapLeague(row: LeagueRow): SportLeague {
  return {
    leagueId: row.league_id,
    sport: row.sport,
    name: row.name,
    country: row.country,
    logoUrl: row.logo_url,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order
  }
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
    sortOrder: row.sort_order
  }
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
    homeScore: row.home_score,
    awayScore: row.away_score,
    eventDate: row.event_date,
    eventTime: row.event_time,
    status: row.status,
    venue: row.venue
  }
}

function isFinishedStatus(status: string | null): boolean {
  return Boolean(status && /(finished|final|completed|game over|ended|after penalties|after extra time)/i.test(status))
}

function eventSortValue(event: SportEvent): number {
  const time = event.eventTime ? `${event.eventTime}:00` : '12:00:00'
  const value = Date.parse(`${event.eventDate}T${time}Z`)
  return Number.isNaN(value) ? 0 : value
}

export function getLocalDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function listLeagues(db: Database.Database, sport: string): SportLeague[] {
  const rows = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE sport = ?
        ORDER BY enabled DESC, sort_order ASC, name COLLATE NOCASE ASC`
    )
    .all(sport) as LeagueRow[]

  return rows.map(mapLeague)
}

export function getLeagueById(db: Database.Database, leagueId: string): SportLeague | null {
  const row = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE league_id = ?`
    )
    .get(leagueId) as LeagueRow | undefined

  return row ? mapLeague(row) : null
}

export function listEnabledLeagues(db: Database.Database, sport: string): SportLeague[] {
  const rows = db
    .prepare(
      `SELECT league_id, sport, name, country, logo_url, enabled, sort_order
         FROM sports_leagues
        WHERE sport = ? AND enabled = 1
        ORDER BY sort_order ASC, name COLLATE NOCASE ASC`
    )
    .all(sport) as LeagueRow[]

  return rows.map(mapLeague)
}

export function upsertLeague(db: Database.Database, input: UpsertLeagueInput): SportLeague {
  const addedAt = Math.floor(Date.now() / 1000)
  const nextSortOrder =
    (db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM sports_leagues WHERE sport = ?')
      .get(input.sport) as { max_sort: number }).max_sort + 1

  db.prepare(
    `INSERT INTO sports_leagues (league_id, sport, name, country, logo_url, enabled, sort_order, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(league_id) DO UPDATE SET
       sport = excluded.sport,
       name = excluded.name,
       country = excluded.country,
       logo_url = excluded.logo_url`
  ).run(
    input.leagueId,
    input.sport,
    input.name,
    input.country,
    input.logoUrl,
    input.enabled === true ? 1 : 0,
    nextSortOrder,
    addedAt
  )

  return getLeagueById(db, input.leagueId) as SportLeague
}

export function setLeagueEnabled(db: Database.Database, leagueId: string, enabled: boolean): boolean {
  const result = db.prepare('UPDATE sports_leagues SET enabled = ? WHERE league_id = ?').run(enabled ? 1 : 0, leagueId)
  return result.changes > 0
}

export function listTrackedTeams(db: Database.Database, sport?: string): TrackedTeam[] {
  const rows = (sport
    ? db.prepare(
        `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
           FROM sports_teams
          WHERE sport = ?
          ORDER BY sort_order ASC, name COLLATE NOCASE ASC`
      ).all(sport)
    : db.prepare(
        `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
           FROM sports_teams
          ORDER BY sport ASC, sort_order ASC, name COLLATE NOCASE ASC`
      ).all()) as TeamRow[]

  return rows.map(mapTeam)
}

export function getTrackedTeam(db: Database.Database, teamId: string): TrackedTeam | null {
  const row = db
    .prepare(
      `SELECT team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order
         FROM sports_teams
        WHERE team_id = ?`
    )
    .get(teamId) as TeamRow | undefined

  return row ? mapTeam(row) : null
}

export function upsertTrackedTeam(db: Database.Database, input: UpsertTeamInput): TrackedTeam {
  const addedAt = Math.floor(Date.now() / 1000)
  const nextSortOrder =
    (db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM sports_teams WHERE sport = ?')
      .get(input.sport) as { max_sort: number }).max_sort + 1

  db.prepare(
    `INSERT INTO sports_teams (team_id, league_id, sport, name, short_name, badge_url, enabled, sort_order, added_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET
       league_id = excluded.league_id,
       sport = excluded.sport,
       name = excluded.name,
       short_name = excluded.short_name,
       badge_url = excluded.badge_url`
  ).run(
    input.teamId,
    input.leagueId,
    input.sport,
    input.name,
    input.shortName,
    input.badgeUrl,
    nextSortOrder,
    addedAt
  )

  return getTrackedTeam(db, input.teamId) as TrackedTeam
}

export function removeTrackedTeam(db: Database.Database, teamId: string): boolean {
  const result = db.prepare('DELETE FROM sports_teams WHERE team_id = ?').run(teamId)
  return result.changes > 0
}

export function setTrackedTeamEnabled(db: Database.Database, teamId: string, enabled: boolean): boolean {
  const result = db.prepare('UPDATE sports_teams SET enabled = ? WHERE team_id = ?').run(enabled ? 1 : 0, teamId)
  return result.changes > 0
}

export function setTrackedTeamOrder(db: Database.Database, orderedIds: string[]): void {
  const update = db.prepare('UPDATE sports_teams SET sort_order = ? WHERE team_id = ?')
  const apply = db.transaction((ids: string[]) => {
    ids.forEach((teamId, index) => {
      update.run(index, teamId)
    })
  })

  apply(orderedIds)
}

export function upsertEvents(db: Database.Database, events: SportEvent[], fetchedDate: string): void {
  if (events.length === 0) {
    return
  }

  const insert = db.prepare(
    `INSERT INTO sports_events (
       event_id, league_id, sport, home_team_id, away_team_id,
       home_team, away_team, home_score, away_score,
       event_date, event_time, status, venue, fetched_date
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       league_id = excluded.league_id,
       sport = excluded.sport,
       home_team_id = excluded.home_team_id,
       away_team_id = excluded.away_team_id,
       home_team = excluded.home_team,
       away_team = excluded.away_team,
       home_score = excluded.home_score,
       away_score = excluded.away_score,
       event_date = excluded.event_date,
       event_time = excluded.event_time,
       status = excluded.status,
       venue = excluded.venue,
       fetched_date = excluded.fetched_date`
  )

  const apply = db.transaction((items: SportEvent[]) => {
    for (const event of items) {
      insert.run(
        event.eventId,
        event.leagueId,
        event.sport,
        event.homeTeamId,
        event.awayTeamId,
        event.homeTeam,
        event.awayTeam,
        event.homeScore,
        event.awayScore,
        event.eventDate,
        event.eventTime,
        event.status,
        event.venue,
        fetchedDate
      )
    }
  })

  apply(events)
}

export function getTodayEvents(db: Database.Database, sport: string, date: string): SportEvent[] {
  const rows = db
    .prepare(
      `SELECT se.event_id, se.league_id, se.sport, se.home_team_id, se.away_team_id,
              se.home_team, se.away_team, se.home_score, se.away_score,
              se.event_date, se.event_time, se.status, se.venue
         FROM sports_events se
         INNER JOIN sports_leagues sl ON sl.league_id = se.league_id
        WHERE se.sport = ?
          AND se.event_date = ?
          AND sl.enabled = 1
        ORDER BY sl.sort_order ASC, se.event_time ASC, se.home_team COLLATE NOCASE ASC`
    )
    .all(sport, date) as EventRow[]

  return rows.map(mapEvent)
}

export function getTeamEvents(db: Database.Database, teamId: string, today: string): SportTeamEvents {
  const rows = db
    .prepare(
      `SELECT event_id, league_id, sport, home_team_id, away_team_id, home_team, away_team,
              home_score, away_score, event_date, event_time, status, venue
         FROM sports_events
        WHERE home_team_id = ? OR away_team_id = ?`
    )
    .all(teamId, teamId) as EventRow[]

  const events = rows.map(mapEvent)
  const last = events
    .filter((event) => event.eventDate < today || (event.eventDate === today && isFinishedStatus(event.status)))
    .sort((a, b) => eventSortValue(b) - eventSortValue(a))
    .slice(0, 5)
  const next = events
    .filter((event) => event.eventDate > today || (event.eventDate === today && !isFinishedStatus(event.status)))
    .sort((a, b) => eventSortValue(a) - eventSortValue(b))
    .slice(0, 5)

  return { last, next }
}

export function getCacheMeta(db: Database.Database, sport: string, date: string): { fetchedAt: number } | null {
  const row = db
    .prepare(
      `SELECT fetched_at
         FROM sports_cache_meta
        WHERE sport = ? AND fetch_date = ?`
    )
    .get(sport, date) as { fetched_at: number } | undefined

  return row ? { fetchedAt: row.fetched_at } : null
}

export function upsertCacheMeta(db: Database.Database, sport: string, date: string, fetchedAt: number): void {
  db.prepare(
    `INSERT INTO sports_cache_meta (sport, fetch_date, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(sport, fetch_date) DO UPDATE SET fetched_at = excluded.fetched_at`
  ).run(sport, date, fetchedAt)
}

export function getSportSyncStatus(db: Database.Database, sport: string): SportSyncStatus {
  const meta = db
    .prepare(
      `SELECT fetch_date, fetched_at
         FROM sports_cache_meta
        WHERE sport = ?
        ORDER BY fetched_at DESC
        LIMIT 1`
    )
    .get(sport) as { fetch_date: string; fetched_at: number } | undefined

  const enabledLeagueCount = (db
    .prepare('SELECT COUNT(*) AS count FROM sports_leagues WHERE sport = ? AND enabled = 1')
    .get(sport) as { count: number }).count
  const trackedTeamCount = (db
    .prepare('SELECT COUNT(*) AS count FROM sports_teams WHERE sport = ?')
    .get(sport) as { count: number }).count

  return {
    sport,
    lastFetchedAt: meta?.fetched_at ?? null,
    fetchDate: meta?.fetch_date ?? null,
    enabledLeagueCount,
    trackedTeamCount
  }
}