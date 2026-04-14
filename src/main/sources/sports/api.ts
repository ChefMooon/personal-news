import type {
  SportEvent,
  SportEventDetail,
  SportLeague,
  SportStandingRow,
  TeamSearchResult
} from '../../../shared/ipc-types'
import { normalizeEventStatus } from './status'

const SPORTS_DB_FREE_API_KEY = '123'
const SPORTS_DB_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_FREE_API_KEY}`
const ESPN_CORE_BASE_URL = 'https://sports.core.api.espn.com/v2'
const SPORTS_API_MIN_INTERVAL_MS = 500
const SPORTS_API_MAX_RETRIES = 3

let lastSportsRequestAt = 0
let sportsRequestQueue: Promise<void> = Promise.resolve()
let leaguesCatalogPromise: Promise<SportLeague[]> | null = null
const espnTeamCache = new Map<string, Promise<EspnTeam | null>>()

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
  strTeamLogo?: string
  strLogo?: string
  strLogoWide?: string
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
  strProgress?: string | null
  strDescriptionEN?: string | null
}

type SportsDbStanding = {
  intRank?: string | number | null
  idTeam?: string | null
  strTeam?: string | null
  intPlayed?: string | number | null
  intWin?: string | number | null
  intLoss?: string | number | null
  intDraw?: string | number | null
  intPoints?: string | number | null
  intGoalsFor?: string | number | null
  intGoalsAgainst?: string | number | null
  intGoalDifference?: string | number | null
  strForm?: string | null
  strDescription?: string | null
}

type EspnReference = {
  $ref?: string
}

type EspnStat = {
  name?: string
  displayName?: string
  value?: string | number | null
  displayValue?: string | null
}

type EspnRecord = {
  name?: string
  displayName?: string
  summary?: string | null
  stats?: EspnStat[]
}

type EspnStandingEntry = {
  team?: EspnReference
  records?: EspnRecord[]
}

type EspnStandingsGroup = {
  $ref?: string
  name?: string
  displayName?: string
  standings?: EspnReference | EspnStandingEntry[]
}

type EspnStandingsCollection = {
  $ref?: string
  items?: EspnStandingsGroup[]
}

type EspnTeam = {
  id?: string | number
  displayName?: string
}

function parseInteger(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDecimal(value: string | number | null | undefined): number | null {
  if (value == null || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
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

function normalizeLookupKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function extractRefId(ref: string | undefined): string | null {
  if (!ref) {
    return null
  }

  try {
    const url = new URL(ref)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts.at(-1) ?? null
  } catch {
    return null
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null
  }

  const seconds = Number.parseInt(value, 10)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryAt = Date.parse(value)
  if (Number.isNaN(retryAt)) {
    return null
  }

  return Math.max(0, retryAt - Date.now())
}

async function scheduleSportsRequest<T>(task: () => Promise<T>): Promise<T> {
  const previous = sportsRequestQueue
  let releaseQueue!: () => void
  sportsRequestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve
  })

  await previous

  const waitMs = Math.max(0, SPORTS_API_MIN_INTERVAL_MS - (Date.now() - lastSportsRequestAt))
  if (waitMs > 0) {
    await delay(waitMs)
  }

  lastSportsRequestAt = Date.now()

  try {
    return await task()
  } finally {
    releaseQueue()
  }
}

async function request<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const search = new URLSearchParams(params)
  const url = `${SPORTS_DB_BASE_URL}/${path}?${search.toString()}`

  for (let attempt = 0; attempt <= SPORTS_API_MAX_RETRIES; attempt += 1) {
    const response = await scheduleSportsRequest(() => fetch(url))
    if (response.ok) {
      const raw = await response.text()
      if (!raw.trim()) {
        return []
      }

      let payload: unknown
      try {
        payload = JSON.parse(raw) as unknown
      } catch (error) {
        throw new Error(
          `Sports API returned invalid JSON for ${path}: ${error instanceof Error ? error.message : 'Unknown parse error.'}`
        )
      }

      return extractFirstArray<T>(payload)
    }

    if (response.status === 429 && attempt < SPORTS_API_MAX_RETRIES) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
      const backoffMs = retryAfterMs ?? (1000 * 2 ** attempt)
      await delay(backoffMs)
      continue
    }

    throw new Error(`Sports API request failed with HTTP ${response.status}.`)
  }

  throw new Error('Sports API request failed after retry attempts were exhausted.')
}

async function requestJsonFromUrl<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt <= SPORTS_API_MAX_RETRIES; attempt += 1) {
    const response = await scheduleSportsRequest(() => fetch(url, { headers: { Accept: 'application/json' } }))
    if (response.ok) {
      const raw = await response.text()
      if (!raw.trim()) {
        throw new Error(`Sports API returned an empty response for ${url}.`)
      }

      try {
        return JSON.parse(raw) as T
      } catch (error) {
        throw new Error(
          `Sports API returned invalid JSON for ${url}: ${error instanceof Error ? error.message : 'Unknown parse error.'}`
        )
      }
    }

    if (response.status === 429 && attempt < SPORTS_API_MAX_RETRIES) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
      const backoffMs = retryAfterMs ?? (1000 * 2 ** attempt)
      await delay(backoffMs)
      continue
    }

    throw new Error(`Sports API request failed with HTTP ${response.status}.`)
  }

  throw new Error('Sports API request failed after retry attempts were exhausted.')
}

function getEspnStat(record: EspnRecord | undefined, names: string[]): EspnStat | null {
  if (!record?.stats) {
    return null
  }

  const wanted = new Set(names.map((name) => normalizeLookupKey(name)))
  return record.stats.find((stat) => wanted.has(normalizeLookupKey(stat.name ?? stat.displayName ?? ''))) ?? null
}

function getEspnStatInteger(record: EspnRecord | undefined, names: string[]): number | null {
  const stat = getEspnStat(record, names)
  return parseInteger(stat?.value ?? stat?.displayValue)
}

function getEspnStatDecimal(record: EspnRecord | undefined, names: string[]): number | null {
  const stat = getEspnStat(record, names)
  return parseDecimal(stat?.value ?? stat?.displayValue)
}

function getEspnStatDisplay(record: EspnRecord | undefined, names: string[]): string | null {
  const stat = getEspnStat(record, names)
  const display = stat?.displayValue?.trim()
  if (display) {
    return display
  }

  if (stat?.value == null || stat.value === '') {
    return null
  }

  return String(stat.value)
}

function getEspnPrimaryRecord(records: EspnRecord[] | undefined): EspnRecord | undefined {
  if (!records || records.length === 0) {
    return undefined
  }

  return records.find((record) => {
    const key = normalizeLookupKey(record.name ?? record.displayName ?? '')
    return key === 'overall' || key === 'leaguestandings' || key === 'teamseasonrecord'
  }) ?? records[0]
}

function getEspnDescription(record: EspnRecord | undefined): string | null {
  const clincher = getEspnStatDisplay(record, ['clincher'])
  if (clincher) {
    return clincher
  }

  const gamesBehind = getEspnStatDisplay(record, ['gamesBehind', 'divisionGamesBehind'])
  if (gamesBehind && gamesBehind !== '0' && gamesBehind !== '0.0') {
    return `GB ${gamesBehind}`
  }

  const gamesAhead = getEspnStatDisplay(record, ['gamesAhead'])
  if (gamesAhead && gamesAhead !== '0' && gamesAhead !== '0.0') {
    return `GA ${gamesAhead}`
  }

  return null
}

function resolveEspnStandingsLeague(leagueId: string, sport: string, leagueName?: string): { sportPath: string; leaguePath: string } | null {
  const normalizedName = leagueName?.trim() ?? ''

  if (sport === 'Baseball' && (leagueId === '4424' || /major league baseball|\bmlb\b/i.test(normalizedName))) {
    return { sportPath: 'baseball', leaguePath: 'mlb' }
  }

  if (sport === 'Basketball' && (leagueId === '4387' || /national basketball association|\bnba\b/i.test(normalizedName))) {
    return { sportPath: 'basketball', leaguePath: 'nba' }
  }

  if (sport === 'Ice Hockey' && (leagueId === '4380' || /national hockey league|\bnhl\b/i.test(normalizedName))) {
    return { sportPath: 'hockey', leaguePath: 'nhl' }
  }

  return null
}

async function fetchEspnTeam(teamRef: string): Promise<EspnTeam | null> {
  const cached = espnTeamCache.get(teamRef)
  if (cached) {
    return cached
  }

  const pending = requestJsonFromUrl<EspnTeam>(teamRef).catch(() => null)
  espnTeamCache.set(teamRef, pending)
  return pending
}

async function fetchEspnStandings(
  leagueId: string,
  sport: string,
  season: string,
  leagueName?: string
): Promise<SportStandingRow[] | null> {
  const espnLeague = resolveEspnStandingsLeague(leagueId, sport, leagueName)
  if (!espnLeague) {
    return null
  }

  const rootUrl = `${ESPN_CORE_BASE_URL}/sports/${espnLeague.sportPath}/leagues/${espnLeague.leaguePath}/standings`
  const root = await requestJsonFromUrl<EspnStandingsCollection>(rootUrl)
  const collection = root.$ref ? await requestJsonFromUrl<EspnStandingsCollection>(root.$ref) : root
  const selectedGroup = collection.items?.find((item) => {
    const key = normalizeLookupKey(item.displayName ?? item.name ?? '')
    return key === 'standings' || key === 'overall'
  }) ?? collection.items?.[0]

  const group = selectedGroup?.$ref
    ? await requestJsonFromUrl<EspnStandingsGroup>(selectedGroup.$ref)
    : selectedGroup

  if (!group) {
    return []
  }

  const standings = Array.isArray(group.standings)
    ? group.standings
    : group.standings?.$ref
      ? await requestJsonFromUrl<EspnStandingEntry[]>(group.standings.$ref)
      : []

  const rows = await Promise.all(
    standings.map(async (entry, index): Promise<SportStandingRow | null> => {
      const teamRef = entry.team?.$ref
      const team = teamRef ? await fetchEspnTeam(teamRef) : null
      const primaryRecord = getEspnPrimaryRecord(entry.records)
      const teamId = extractRefId(teamRef) ?? (team?.id == null ? null : String(team.id))
      const teamName = team?.displayName?.trim()

      if (!teamId || !teamName || !primaryRecord) {
        return null
      }

      const winPercent = getEspnStatDecimal(primaryRecord, ['winPercent', 'leagueWinPercent'])
      const points = sport === 'Ice Hockey'
        ? (getEspnStatInteger(primaryRecord, ['points']) ?? 0)
        : (winPercent == null ? 0 : Math.round(winPercent * 1000))

      return {
        rank: getEspnStatInteger(primaryRecord, ['playoffSeed', 'position', 'rank']) ?? (index + 1),
        teamId,
        teamName,
        played: getEspnStatInteger(primaryRecord, ['gamesPlayed']) ?? 0,
        win: getEspnStatInteger(primaryRecord, ['wins']) ?? 0,
        loss: getEspnStatInteger(primaryRecord, ['losses']) ?? 0,
        draw: sport === 'Ice Hockey'
          ? (getEspnStatInteger(primaryRecord, ['overtimeLosses', 'otLosses', 'OTLosses']) ?? 0)
          : (getEspnStatInteger(primaryRecord, ['ties']) ?? 0),
        points,
        goalsFor: getEspnStatInteger(primaryRecord, ['goalsFor', 'pointsFor', 'runsScored', 'avgPointsFor']),
        goalsAgainst: getEspnStatInteger(primaryRecord, ['goalsAgainst', 'pointsAgainst', 'runsAllowed', 'avgPointsAgainst']),
        goalDifference: getEspnStatInteger(primaryRecord, ['goalDifference', 'pointsDiff', 'pointDifferential', 'differential']),
        form: null,
        description: getEspnDescription(primaryRecord),
        leagueId,
        season
      }
    })
  )

  return rows
    .filter((item): item is SportStandingRow => item !== null)
    .sort((left, right) => left.rank - right.rank || left.teamName.localeCompare(right.teamName))
}

function mapLeague(row: SportsDbLeague): SportLeague | null {
  if (!row.idLeague || !row.strLeague || !row.strSport) {
    return null
  }

  return {
    leagueId: String(row.idLeague),
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
    leagueId: String(row.idLeague),
    sport: row.strSport,
    homeTeamId: row.idHomeTeam ?? null,
    awayTeamId: row.idAwayTeam ?? null,
    homeTeam: row.strHomeTeam,
    awayTeam: row.strAwayTeam,
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: row.intHomeScore == null ? null : String(row.intHomeScore),
    awayScore: row.intAwayScore == null ? null : String(row.intAwayScore),
    eventDate: row.dateEvent,
    eventTime: normalizeClockTime(row.strTime),
    status: normalizeEventStatus(row.strStatus, row.strProgress),
    venue: row.strVenue ?? null
  }
}

function mapEventDetail(row: SportsDbEvent): SportEventDetail | null {
  const base = mapEvent(row)
  if (!base) {
    return null
  }

  return {
    ...base,
    progress: row.strProgress?.trim() || null,
    descriptionEN: row.strDescriptionEN?.trim() || null
  }
}

function mapStandingRow(row: SportsDbStanding, leagueId: string, season: string): SportStandingRow | null {
  if (!row.idTeam || !row.strTeam) {
    return null
  }

  return {
    rank: parseInteger(row.intRank) ?? 0,
    teamId: row.idTeam,
    teamName: row.strTeam,
    played: parseInteger(row.intPlayed) ?? 0,
    win: parseInteger(row.intWin) ?? 0,
    loss: parseInteger(row.intLoss) ?? 0,
    draw: parseInteger(row.intDraw) ?? 0,
    points: parseInteger(row.intPoints) ?? 0,
    goalsFor: parseInteger(row.intGoalsFor),
    goalsAgainst: parseInteger(row.intGoalsAgainst),
    goalDifference: parseInteger(row.intGoalDifference),
    form: row.strForm?.trim() || null,
    description: row.strDescription?.trim() || null,
    leagueId,
    season
  }
}

function mapTeamSearchResult(row: SportsDbTeam): TeamSearchResult | null {
  if (!row.idTeam || !row.idLeague || !row.strTeam || !row.strLeague || !row.strSport) {
    return null
  }

  return {
    teamId: row.idTeam,
    name: row.strTeam,
    leagueId: String(row.idLeague),
    leagueName: row.strLeague,
    sport: row.strSport,
    badgeUrl: normalizeRemoteUrl(row.strTeamBadge ?? row.strBadge ?? row.strTeamLogo ?? row.strLogo ?? row.strLogoWide ?? null)
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

export async function fetchLeaguesForSport(sport: string, forceRefresh = false): Promise<SportLeague[]> {
  if (forceRefresh) {
    leaguesCatalogPromise = null
  }

  if (!leaguesCatalogPromise) {
    leaguesCatalogPromise = request<SportsDbLeague>('all_leagues.php', {})
      .then((rows) => rows.map(mapLeague).filter((item): item is SportLeague => item !== null))
      .catch((error) => {
        leaguesCatalogPromise = null
        throw error
      })
  }

  const leagues = await leaguesCatalogPromise
  return leagues.filter((item) => item.sport === sport)
}

export async function fetchLeagueEventsForDate(date: string, leagueName: string): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>('eventsday.php', { d: date, l: leagueName })
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null)
}

export async function fetchEventById(eventId: string): Promise<SportEvent | null> {
  const rows = await request<SportsDbEvent>('lookupevent.php', { id: eventId })
  return rows.map(mapEvent).find((item): item is SportEvent => item !== null) ?? null
}

export async function fetchEventDetails(eventId: string): Promise<SportEventDetail | null> {
  const rows = await request<SportsDbEvent>('lookupevent.php', { id: eventId })
  return rows.map(mapEventDetail).find((item): item is SportEventDetail => item !== null) ?? null
}

export async function fetchLeagueStandings(
  leagueId: string,
  season: string,
  sport: string,
  leagueName?: string
): Promise<SportStandingRow[]> {
  const espnRows = await fetchEspnStandings(leagueId, sport, season, leagueName)
  if (espnRows) {
    return espnRows
  }

  const rows = await request<SportsDbStanding>('lookuptable.php', { l: leagueId, s: season })
  return rows
    .map((row) => mapStandingRow(row, leagueId, season))
    .filter((item): item is SportStandingRow => item !== null)
    .sort((left, right) => left.rank - right.rank || left.teamName.localeCompare(right.teamName))
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
    leagueId: String(match.idLeague),
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(match.strTeamBadge ?? match.strBadge ?? match.strTeamLogo ?? match.strLogo ?? match.strLogoWide ?? null)
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
    leagueId: String(match.idLeague),
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(match.strTeamBadge ?? match.strBadge ?? match.strTeamLogo ?? match.strLogo ?? match.strLogoWide ?? null)
  }
}

export async function fetchTeamBadgesForLeague(leagueName: string): Promise<{ teamId: string; name: string; badgeUrl: string | null }[]> {
  const rows = await request<SportsDbTeam>('search_all_teams.php', { l: leagueName })
  return rows
    .filter((row): row is SportsDbTeam & { idTeam: string; strTeam: string } => Boolean(row.idTeam && row.strTeam))
    .map((row) => ({
      teamId: row.idTeam,
      name: row.strTeam,
      badgeUrl: normalizeRemoteUrl(row.strTeamBadge ?? row.strBadge ?? row.strTeamLogo ?? row.strLogo ?? row.strLogoWide ?? null)
    }))
}