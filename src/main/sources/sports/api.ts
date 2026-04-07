import type { SportLeague, SportEvent, TeamSearchResult } from '../../../shared/ipc-types'

const SPORTS_DB_FREE_API_KEY = '123'
const SPORTS_DB_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_FREE_API_KEY}`

type SportsDbLeague = {
  idLeague?: string
  strLeague?: string
  strCountry?: string
  strBadge?: string
  strLogo?: string
  strLogoWide?: string
  strSport?: string
}

type SportsDbTeam = {
  idTeam?: string
  idLeague?: string
  strTeam?: string
  strTeamShort?: string
  strLeague?: string
  strSport?: string
  strTeamBadge?: string
  strBadge?: string
}

type SportsDbEvent = {
  idEvent?: string
  idLeague?: string
  strSport?: string
  idHomeTeam?: string
  idAwayTeam?: string
  strHomeTeam?: string
  strAwayTeam?: string
  intHomeScore?: string | number | null
  intAwayScore?: string | number | null
  dateEvent?: string
  strTime?: string | null
  strStatus?: string | null
  strVenue?: string | null
}

function normalizeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function normalizeClockTime(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{2}:\d{2})(?::\d{2})?$/)
  return match ? match[1] : null
}

function extractFirstArray<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      return value as T[]
    }
  }

  return []
}

async function request<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const search = new URLSearchParams(params)
  const response = await fetch(`${SPORTS_DB_BASE_URL}/${path}?${search.toString()}`)
  if (!response.ok) {
    throw new Error(`Sports API request failed with HTTP ${response.status}.`)
  }

  const payload = (await response.json()) as unknown
  return extractFirstArray<T>(payload)
}

function mapLeague(row: SportsDbLeague): SportLeague | null {
  if (!row.idLeague || !row.strLeague || !row.strSport) {
    return null
  }

  return {
    leagueId: row.idLeague,
    sport: row.strSport,
    name: row.strLeague,
    country: row.strCountry ?? null,
    logoUrl: normalizeRemoteUrl(row.strBadge ?? row.strLogo ?? row.strLogoWide ?? null),
    enabled: false,
    sortOrder: 0
  }
}

function mapEvent(row: SportsDbEvent): SportEvent | null {
  if (!row.idEvent || !row.idLeague || !row.strSport || !row.strHomeTeam || !row.strAwayTeam || !row.dateEvent) {
    return null
  }

  return {
    eventId: row.idEvent,
    leagueId: row.idLeague,
    sport: row.strSport,
    homeTeamId: row.idHomeTeam ?? null,
    awayTeamId: row.idAwayTeam ?? null,
    homeTeam: row.strHomeTeam,
    awayTeam: row.strAwayTeam,
    homeScore: row.intHomeScore == null ? null : String(row.intHomeScore),
    awayScore: row.intAwayScore == null ? null : String(row.intAwayScore),
    eventDate: row.dateEvent,
    eventTime: normalizeClockTime(row.strTime),
    status: row.strStatus ?? null,
    venue: row.strVenue ?? null
  }
}

function mapTeamSearchResult(row: SportsDbTeam): TeamSearchResult | null {
  if (!row.idTeam || !row.idLeague || !row.strTeam || !row.strLeague || !row.strSport) {
    return null
  }

  return {
    teamId: row.idTeam,
    name: row.strTeam,
    leagueId: row.idLeague,
    leagueName: row.strLeague,
    sport: row.strSport,
    badgeUrl: normalizeRemoteUrl(row.strTeamBadge ?? row.strBadge ?? null)
  }
}

export type SportsTeamDetails = {
  teamId: string
  leagueId: string
  sport: string
  name: string
  shortName: string | null
  badgeUrl: string | null
}

export async function fetchLeaguesForSport(sport: string): Promise<SportLeague[]> {
  const rows = await request<SportsDbLeague>('all_leagues.php', {})
  return rows.map(mapLeague).filter((item): item is SportLeague => item !== null)
    .filter((item) => item.sport === sport)
}

export async function fetchLeagueEventsForDate(date: string, leagueName: string): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>('eventsday.php', { d: date, l: leagueName })
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null)
}

export async function fetchNextEventsForTeam(teamId: string): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>('eventsnext.php', { id: teamId })
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null)
}

export async function fetchLastEventsForTeam(teamId: string): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>('eventslast.php', { id: teamId })
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null)
}

export async function searchTeams(query: string, sport: string): Promise<TeamSearchResult[]> {
  const rows = await request<SportsDbTeam>('searchteams.php', { t: query.trim() })
  return rows
    .map(mapTeamSearchResult)
    .filter((item): item is TeamSearchResult => item !== null && item.sport === sport)
}

export async function fetchTeamDetailsInLeague(
  teamId: string,
  leagueName: string,
  sport: string
): Promise<SportsTeamDetails | null> {
  const rows = await request<SportsDbTeam>('search_all_teams.php', { l: leagueName })
  const match = rows.find((row) => row.idTeam === teamId && row.strSport === sport)
  if (!match || !match.idTeam || !match.idLeague || !match.strTeam || !match.strSport) {
    return null
  }

  return {
    teamId: match.idTeam,
    leagueId: match.idLeague,
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(match.strTeamBadge ?? match.strBadge ?? null)
  }
}

export async function fetchTeamDetails(teamId: string, sport: string): Promise<SportsTeamDetails | null> {
  const rows = await request<SportsDbTeam>('lookupteam.php', { id: teamId })
  const match = rows.find((row) => row.idTeam === teamId && row.strSport === sport)
  if (!match || !match.idTeam || !match.idLeague || !match.strTeam || !match.strSport) {
    return null
  }

  return {
    teamId: match.idTeam,
    leagueId: match.idLeague,
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(match.strTeamBadge ?? match.strBadge ?? null)
  }
}