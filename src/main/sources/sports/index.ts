import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import type {
  IpcMutationResult,
  SportEvent,
  SportEventDetail,
  SportLeague,
  SportStandingRow,
  SportsSettings,
  SportsDataUpdatedEvent,
  SportSyncStatus,
  SportTeamEvents,
  TeamSearchResult,
  TrackedTeam
} from '../../../shared/ipc-types'
import { IPC } from '../../../shared/ipc-types'
import {
  DEFAULT_SPORT,
  DEFAULT_SPORTS_POLL_INTERVAL_MINUTES,
  DEFAULT_SPORTS_STARTUP_REFRESH_STALE_MINUTES,
  SUPPORTED_SPORTS,
  normalizeSportsPollIntervalMinutes,
  normalizeSportsStartupRefreshStaleMinutes,
  type SupportedSport
} from '../../../shared/sports'
import { getSetting, setSetting } from '../../settings/store'
import type { DataSourceModule } from '../registry'
import {
  fetchEventById,
  fetchEventDetails,
  fetchTeamBadgesForLeague,
  fetchTeamDetails,
  fetchLastEventsForTeam,
  fetchLeagueStandings,
  fetchLeagueEventsForDate,
  fetchLeaguesForSport,
  fetchNextEventsForTeam,
  fetchTeamDetailsInLeague,
  searchTeams as searchTeamsFromApi
} from './api'
import {
  getBadgeCacheMeta,
  getCacheMeta,
  getLeagueById,
  getLocalDateString,
  getOpponentBadge,
  getSportSyncStatus,
  getTeamEvents as readTeamEvents,
  getTodayEvents as readTodayEvents,
  getTrackedTeam,
  listEnabledLeagues,
  listLeagues,
  listTrackedTeams,
  removeTrackedTeam,
  setLeagueEnabled,
  setTrackedTeamEnabled,
  setTrackedTeamOrder,
  upsertBadgeCacheMeta,
  upsertCacheMeta,
  upsertEvents,
  upsertLeague,
  upsertOpponentBadge,
  upsertTrackedTeam
} from './cache'

const SPORTS_ENABLED_KEY = 'sports_enabled'
const SPORTS_POLL_INTERVAL_KEY = 'sports_poll_interval_minutes'
const SPORTS_STARTUP_REFRESH_STALE_MINUTES_KEY = 'sports_startup_refresh_stale_minutes'
const LIVE_REFRESH_INTERVAL_MS = 60_000
const BADGE_REFRESH_INTERVAL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_ENABLED_LEAGUE_IDS: Partial<Record<SupportedSport, Set<string>>> = {
  Baseball: new Set(['4424']),
  Basketball: new Set(['4387'])
}
const DEFAULT_ENABLED_LEAGUE_PATTERNS: Partial<Record<SupportedSport, RegExp[]>> = {
  Baseball: [/major league baseball|\bmlb\b/i],
  Basketball: [/national basketball association|\bnba\b/i],
  'Ice Hockey': [/national hockey league|\bnhl\b/i]
}

let dbRef: Database.Database | null = null
const refreshPromises = new Map<string, Promise<void>>()
const badgeRefreshPromises = new Map<string, Promise<void>>()
let pollTimer: ReturnType<typeof setInterval> | null = null
const liveRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()

function ensureDb(): Database.Database {
  if (!dbRef) {
    throw new Error('Sports module not initialized.')
  }

  return dbRef
}

function isSportsEnabled(): boolean {
  return getSetting(SPORTS_ENABLED_KEY) !== 'false'
}

function isLiveEventStatus(status: string | null): boolean {
  return Boolean(
    status
      && !/(finished|final|completed|game over|ended|after penalties|after extra time|full time|\bft\b|\baet\b)/i.test(status)
      && /(live|in progress|half time|break|period|quarter|inning|set \d|overtime|extra time|top \d|bottom \d|\b(?:1st|2nd|3rd|4th)\b|\d{1,3}(?:\+\d{1,2})?['’])/i.test(status)
  )
}

function getPollIntervalMinutes(): number {
  const raw = getSetting(SPORTS_POLL_INTERVAL_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SPORTS_POLL_INTERVAL_MINUTES
  }

  return normalizeSportsPollIntervalMinutes(parsed)
}

function getStartupRefreshStaleMinutes(): number {
  const raw = getSetting(SPORTS_STARTUP_REFRESH_STALE_MINUTES_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SPORTS_STARTUP_REFRESH_STALE_MINUTES
  }

  return normalizeSportsStartupRefreshStaleMinutes(parsed)
}

function clearLiveRefreshTimer(sport: string): void {
  const timer = liveRefreshTimers.get(sport)
  if (!timer) {
    return
  }

  clearTimeout(timer)
  liveRefreshTimers.delete(sport)
}

function clearLiveRefreshTimers(): void {
  for (const timer of liveRefreshTimers.values()) {
    clearTimeout(timer)
  }
  liveRefreshTimers.clear()
}

function stopPollTimer(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPollTimer(): void {
  stopPollTimer()

  if (!dbRef || !isSportsEnabled()) {
    return
  }

  pollTimer = setInterval(() => {
    for (const sport of SUPPORTED_SPORTS) {
      void refreshSportInternal(sport, true).catch((error) => {
        console.error(`[Sports] Scheduled refresh failed for ${sport}:`, error)
      })
    }
  }, getPollIntervalMinutes() * 60 * 1000)
}

async function prefetchLeagueTeamBadges(db: Database.Database, leagueName: string): Promise<void> {
  try {
    const teams = await fetchTeamBadgesForLeague(leagueName)
    for (const team of teams) {
      if (getTrackedTeam(db, team.teamId)?.badgeUrl) {
        continue
      }
      upsertOpponentBadge(db, team.teamId, team.name, team.badgeUrl)
    }
  } catch (error) {
    console.warn(`[Sports] Failed to prefetch team badges for league "${leagueName}":`, error)
  }
}

function normalizeTeamLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeLeagueLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function searchTeamBadgeByName(
  teamName: string,
  sport: string,
  leagueName?: string
): Promise<{ name: string; badgeUrl: string | null } | null> {
  const matches = await searchTeamsFromApi(teamName, sport)
  if (matches.length === 0) {
    return null
  }

  const teamKey = normalizeTeamLookupKey(teamName)
  const leagueKey = leagueName ? normalizeLeagueLookupKey(leagueName) : null
  const exactNameMatches = matches.filter((match) => normalizeTeamLookupKey(match.name) === teamKey)
  const preferred = (leagueKey
    ? exactNameMatches.find((match) => normalizeLeagueLookupKey(match.leagueName) === leagueKey)
    : null)
    ?? exactNameMatches[0]
    ?? (leagueKey ? matches.find((match) => normalizeLeagueLookupKey(match.leagueName) === leagueKey) : null)
    ?? matches[0]

  return preferred ? { name: preferred.name, badgeUrl: preferred.badgeUrl } : null
}

async function backfillEventTeamBadges(
  db: Database.Database,
  events: SportEvent[],
  sport: string,
  leagueName?: string
): Promise<void> {
  const teamCandidates = new Map<string, string>()
  let leagueBadgeCatalogByName: Map<string, { name: string; badgeUrl: string | null }> | null = null
  const searchedTeamNames = new Map<string, Promise<{ name: string; badgeUrl: string | null } | null>>()

  const getLeagueBadgeCatalogByName = async (): Promise<Map<string, { name: string; badgeUrl: string | null }>> => {
    if (leagueBadgeCatalogByName) {
      return leagueBadgeCatalogByName
    }

    const teams = leagueName ? await fetchTeamBadgesForLeague(leagueName) : []
    leagueBadgeCatalogByName = new Map(
      teams.map((team) => [normalizeTeamLookupKey(team.name), { name: team.name, badgeUrl: team.badgeUrl }] as const)
    )
    return leagueBadgeCatalogByName
  }

  for (const event of events) {
    if (event.homeTeamId) {
      teamCandidates.set(event.homeTeamId, event.homeTeam)
    }
    if (event.awayTeamId) {
      teamCandidates.set(event.awayTeamId, event.awayTeam)
    }
  }

  for (const [teamId, fallbackName] of teamCandidates) {
    const trackedTeam = getTrackedTeam(db, teamId)
    const opponentBadge = getOpponentBadge(db, teamId)
    if (trackedTeam?.badgeUrl || opponentBadge) {
      continue
    }

    const details = leagueName
      ? await fetchTeamDetailsInLeague(teamId, leagueName, sport)
      : await fetchTeamDetails(teamId, sport)

    const fallbackMatch = !details?.badgeUrl && leagueName
      ? (await getLeagueBadgeCatalogByName()).get(normalizeTeamLookupKey(fallbackName))
      : null
    let searchMatch: { name: string; badgeUrl: string | null } | null = null
    if (!details?.badgeUrl && !fallbackMatch?.badgeUrl) {
      const searchKey = `${sport}:${leagueName ?? ''}:${normalizeTeamLookupKey(fallbackName)}`
      const pending = searchedTeamNames.get(searchKey) ?? searchTeamBadgeByName(fallbackName, sport, leagueName)
      searchedTeamNames.set(searchKey, pending)
      searchMatch = await pending
    }

    const badgeUrl = details?.badgeUrl ?? fallbackMatch?.badgeUrl ?? searchMatch?.badgeUrl ?? null
    const resolvedName = details?.name ?? fallbackMatch?.name ?? searchMatch?.name ?? fallbackName

    if (!badgeUrl) {
      continue
    }

    upsertOpponentBadge(db, teamId, resolvedName, badgeUrl)

    if (trackedTeam && !trackedTeam.badgeUrl) {
      upsertTrackedTeam(db, {
        teamId: trackedTeam.teamId,
        leagueId: trackedTeam.leagueId,
        sport: trackedTeam.sport,
        name: trackedTeam.name,
        shortName: trackedTeam.shortName,
        badgeUrl
      })
    }
  }
}

function isBadgeRefreshStale(fetchedAt: number | null | undefined, nowSeconds: number): boolean {
  return fetchedAt == null || nowSeconds - fetchedAt >= BADGE_REFRESH_INTERVAL_SECONDS
}

async function syncLeagueCatalog(sport: string, forceRefresh = false): Promise<SportLeague[]> {
  const db = ensureDb()
  const existing = listLeagues(db, sport)
  if (existing.length > 0 && !forceRefresh) {
    return existing
  }

  const leagues = await fetchLeaguesForSport(sport, forceRefresh)
  for (const league of leagues) {
    upsertLeague(db, {
      leagueId: league.leagueId,
      sport: league.sport,
      name: league.name,
      country: league.country,
      logoUrl: league.logoUrl,
      enabled: defaultLeagueEnabled(sport, league)
    })
  }

  return listLeagues(db, sport)
}

async function refreshEnabledLeagueBadges(sport: string, force: boolean): Promise<void> {
  const db = ensureDb()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const existingEnabledLeagues = listEnabledLeagues(db, sport)

  if (existingEnabledLeagues.length === 0) {
    if (force) {
      await syncLeagueCatalog(sport, true)
    }
    return
  }

  const shouldRefreshAny = force || existingEnabledLeagues.some((league) => {
    const meta = getBadgeCacheMeta(db, league.sport, league.leagueId)
    return isBadgeRefreshStale(meta?.fetchedAt, nowSeconds)
  })

  if (!shouldRefreshAny) {
    return
  }

  await syncLeagueCatalog(sport, true)
  const enabledLeagues = listEnabledLeagues(db, sport)
  const today = getLocalDateString()
  for (const league of enabledLeagues) {
    const meta = getBadgeCacheMeta(db, league.sport, league.leagueId)
    if (!force && !isBadgeRefreshStale(meta?.fetchedAt, nowSeconds)) {
      continue
    }

    await prefetchLeagueTeamBadges(db, league.name)
    const cachedLeagueEvents = readTodayEvents(db, league.sport, today).filter((event) => event.leagueId === league.leagueId)
    if (cachedLeagueEvents.length > 0) {
      await backfillEventTeamBadges(db, cachedLeagueEvents, league.sport, league.name)
    }
    upsertBadgeCacheMeta(db, league.sport, league.leagueId, nowSeconds)
  }
}

async function refreshSportsBadgesInternal(sport: string, force: boolean): Promise<void> {
  const existing = badgeRefreshPromises.get(sport)
  if (existing) {
    return existing
  }

  const task = refreshEnabledLeagueBadges(sport, force)
    .then(() => {
      emitSportsUpdated({ sport, ok: true, error: null })
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to refresh sports badges.'
      emitSportsUpdated({ sport, ok: false, error: message })
      throw error
    })
    .finally(() => {
      badgeRefreshPromises.delete(sport)
    })

  badgeRefreshPromises.set(sport, task)
  return task
}

async function ensureLeagueCatalogLoaded(sport: string): Promise<SportLeague[]> {
  return syncLeagueCatalog(sport)
}

function emitSportsUpdated(payload: SportsDataUpdatedEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.SPORTS_DATA_UPDATED, payload)
  }
}

function defaultLeagueEnabled(sport: string, league: SportLeague): boolean {
  if (DEFAULT_ENABLED_LEAGUE_IDS[sport]?.has(league.leagueId)) {
    return true
  }

  return DEFAULT_ENABLED_LEAGUE_PATTERNS[sport]?.some((pattern) => pattern.test(league.name)) ?? false
}

async function refreshTrackedTeam(team: TrackedTeam, fetchedDate: string): Promise<void> {
  const db = ensureDb()
  const [lastEvents, nextEvents] = await Promise.all([
    fetchLastEventsForTeam(team.teamId),
    fetchNextEventsForTeam(team.teamId)
  ])
  const events = [...lastEvents, ...nextEvents]
  const leagueName = getLeagueById(db, team.leagueId)?.name
  await backfillEventTeamBadges(db, events, team.sport, leagueName)
  upsertEvents(db, events, fetchedDate)
}

function scheduleLiveRefreshIfNeeded(sport: string): void {
  const db = ensureDb()
  const today = getLocalDateString()
  const hasLiveEvents = readTodayEvents(db, sport, today).some((event) => isLiveEventStatus(event.status))

  if (!hasLiveEvents) {
    clearLiveRefreshTimer(sport)
    return
  }

  if (liveRefreshTimers.has(sport)) {
    return
  }

  const timer = setTimeout(() => {
    liveRefreshTimers.delete(sport)
    void doLiveRefresh(sport)
  }, LIVE_REFRESH_INTERVAL_MS)

  liveRefreshTimers.set(sport, timer)
}

async function doLiveRefresh(sport: string): Promise<void> {
  const db = ensureDb()
  const fetchDate = getLocalDateString()
  const liveEvents = readTodayEvents(db, sport, fetchDate).filter((event) => isLiveEventStatus(event.status))
  const refreshedEvents: SportEvent[] = []

  for (const event of liveEvents) {
    const refreshedEvent = await fetchEventById(event.eventId)
    if (refreshedEvent) {
      refreshedEvents.push(refreshedEvent)
    }
  }

  if (refreshedEvents.length > 0) {
    const leagueNamesById = new Map(listEnabledLeagues(db, sport).map((league) => [league.leagueId, league.name] as const))
    const eventsByLeague = new Map<string, SportEvent[]>()
    for (const item of refreshedEvents) {
      const existing = eventsByLeague.get(item.leagueId)
      if (existing) {
        existing.push(item)
      } else {
        eventsByLeague.set(item.leagueId, [item])
      }
    }
    for (const [leagueId, leagueEvents] of eventsByLeague) {
      await backfillEventTeamBadges(db, leagueEvents, sport, leagueNamesById.get(leagueId))
    }
    upsertEvents(db, refreshedEvents, fetchDate)
  }

  upsertCacheMeta(db, sport, fetchDate, Math.floor(Date.now() / 1000))
  emitSportsUpdated({ sport, ok: true, error: null })
  scheduleLiveRefreshIfNeeded(sport)
}

async function doRefreshSport(sport: string, force: boolean): Promise<void> {
  const db = ensureDb()
  const fetchDate = getLocalDateString()

  if (!force && getCacheMeta(db, sport, fetchDate)) {
    return
  }

  await ensureLeagueCatalogLoaded(sport)
  await refreshEnabledLeagueBadges(sport, false)

  const enabledLeagues = listEnabledLeagues(db, sport)
  for (const league of enabledLeagues) {
    const events = await fetchLeagueEventsForDate(fetchDate, league.name)
    await backfillEventTeamBadges(db, events, sport, league.name)
    upsertEvents(db, events, fetchDate)
  }

  const trackedTeams = listTrackedTeams(db, sport)
  for (const team of trackedTeams) {
    await refreshTrackedTeam(team, fetchDate)
  }

  upsertCacheMeta(db, sport, fetchDate, Math.floor(Date.now() / 1000))
  scheduleLiveRefreshIfNeeded(sport)
}

async function refreshSportInternal(sport: string, force: boolean): Promise<void> {
  const existing = refreshPromises.get(sport)
  if (existing) {
    return existing
  }

  const task = doRefreshSport(sport, force)
    .then(() => {
      emitSportsUpdated({ sport, ok: true, error: null })
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : 'Failed to refresh sports data.'
      emitSportsUpdated({ sport, ok: false, error: message })
      throw error
    })
    .finally(() => {
      refreshPromises.delete(sport)
    })

  refreshPromises.set(sport, task)
  return task
}

export function getSportsTodayEvents(sport: string): SportEvent[] {
  const db = ensureDb()
  return readTodayEvents(db, sport, getLocalDateString())
}

export function getSportsTeamEvents(teamId: string): SportTeamEvents {
  const db = ensureDb()
  return readTeamEvents(db, teamId, getLocalDateString())
}

export function getSportsTrackedTeams(): TrackedTeam[] {
  return listTrackedTeams(ensureDb())
}

export async function getSportsStandings(
  leagueId: string,
  season: string,
  sport: string,
  leagueName?: string
): Promise<SportStandingRow[]> {
  return fetchLeagueStandings(leagueId, season, sport, leagueName)
}

export async function getSportsEventDetails(eventId: string): Promise<SportEventDetail | null> {
  return fetchEventDetails(eventId)
}

export function getSportsSettings(): SportsSettings {
  return {
    pollIntervalMinutes: getPollIntervalMinutes(),
    startupRefreshStaleMinutes: getStartupRefreshStaleMinutes()
  }
}

export function updateSportsSettings(settings: Partial<SportsSettings>): SportsSettings {
  if (settings.pollIntervalMinutes !== undefined) {
    const clamped = normalizeSportsPollIntervalMinutes(settings.pollIntervalMinutes)
    setSetting(SPORTS_POLL_INTERVAL_KEY, String(clamped))
  }

  if (settings.startupRefreshStaleMinutes !== undefined) {
    const clamped = normalizeSportsStartupRefreshStaleMinutes(settings.startupRefreshStaleMinutes)
    setSetting(SPORTS_STARTUP_REFRESH_STALE_MINUTES_KEY, String(clamped))
  }

  if (isSportsEnabled()) {
    startPollTimer()
  }

  return getSportsSettings()
}

export async function addSportsTeam(
  teamId: string,
  leagueId: string,
  sport: string,
  fallback?: {
    teamName?: string
    leagueName?: string
    badgeUrl?: string | null
  }
): Promise<TrackedTeam> {
  const db = ensureDb()
  const leagues = await ensureLeagueCatalogLoaded(sport)
  const league = leagues.find((item) => item.leagueId === leagueId)
  const details = league
    ? await fetchTeamDetailsInLeague(teamId, league.name, sport)
    : await fetchTeamDetails(teamId, sport)

  if (!details && fallback?.teamName) {
    if (!league && fallback.leagueName) {
      upsertLeague(db, {
        leagueId,
        sport,
        name: fallback.leagueName,
        country: null,
        logoUrl: null,
        enabled: defaultLeagueEnabled(sport, {
          leagueId,
          sport,
          name: fallback.leagueName,
          country: null,
          logoUrl: null,
          enabled: false,
          sortOrder: 0
        })
      })
    }

    const team = upsertTrackedTeam(db, {
      teamId,
      leagueId,
      sport,
      name: fallback.teamName,
      shortName: null,
      badgeUrl: fallback.badgeUrl ?? null
    })

    void refreshTrackedTeam(team, getLocalDateString())
      .then(() => {
        scheduleLiveRefreshIfNeeded(team.sport)
        emitSportsUpdated({ sport, ok: true, error: null })
      })
      .catch((error) => {
        emitSportsUpdated({
          sport,
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to fetch team sports data.'
        })
      })

    return team
  }

  if (!details) {
    throw new Error('Unable to find that team in the selected league.')
  }

  const team = upsertTrackedTeam(db, details)
  void refreshTrackedTeam(team, getLocalDateString())
    .then(() => {
      scheduleLiveRefreshIfNeeded(team.sport)
      emitSportsUpdated({ sport, ok: true, error: null })
    })
    .catch((error) => {
      emitSportsUpdated({
        sport,
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch team sports data.'
      })
    })

  return team
}

export function removeSportsTeam(teamId: string): IpcMutationResult {
  const team = getTrackedTeam(ensureDb(), teamId)
  const removed = removeTrackedTeam(ensureDb(), teamId)
  if (!removed) {
    return { ok: false, error: 'Tracked team not found.' }
  }

  emitSportsUpdated({ sport: team?.sport ?? DEFAULT_SPORT, ok: true, error: null })
  return { ok: true, error: null }
}

export function setSportsTeamEnabled(teamId: string, enabled: boolean): IpcMutationResult {
  const team = getTrackedTeam(ensureDb(), teamId)
  const updated = setTrackedTeamEnabled(ensureDb(), teamId, enabled)
  if (!updated) {
    return { ok: false, error: 'Tracked team not found.' }
  }

  emitSportsUpdated({ sport: team?.sport ?? DEFAULT_SPORT, ok: true, error: null })
  return { ok: true, error: null }
}

export function setSportsTeamOrder(orderedIds: string[]): IpcMutationResult {
  setTrackedTeamOrder(ensureDb(), orderedIds)
  const updatedSport = orderedIds[0] ? getTrackedTeam(ensureDb(), orderedIds[0])?.sport ?? DEFAULT_SPORT : DEFAULT_SPORT
  emitSportsUpdated({ sport: updatedSport, ok: true, error: null })
  return { ok: true, error: null }
}

export async function getSportsLeagues(sport: string): Promise<SportLeague[]> {
  return ensureLeagueCatalogLoaded(sport)
}

export async function addSportsLeague(leagueId: string, sport: string): Promise<SportLeague> {
  const db = ensureDb()
  const existing = (await ensureLeagueCatalogLoaded(sport)).find((league) => league.leagueId === leagueId)
  if (!existing) {
    throw new Error('League not found.')
  }

  setLeagueEnabled(db, leagueId, true)
  const updated = listLeagues(db, sport).find((league) => league.leagueId === leagueId)
  if (!updated) {
    throw new Error('Failed to enable sports league.')
  }

  void refreshSportInternal(sport, true).catch(() => {
  })
  return updated
}

export function removeSportsLeague(leagueId: string): IpcMutationResult {
  const league = getLeagueById(ensureDb(), leagueId)
  const updated = setLeagueEnabled(ensureDb(), leagueId, false)
  if (!updated) {
    return { ok: false, error: 'League not found.' }
  }

  emitSportsUpdated({ sport: league?.sport ?? DEFAULT_SPORT, ok: true, error: null })
  return { ok: true, error: null }
}

export async function searchSportsTeams(query: string, sport: string): Promise<TeamSearchResult[]> {
  return searchTeamsFromApi(query, sport)
}

export async function refreshSportsData(sport: string, force = true): Promise<void> {
  await refreshSportInternal(sport, force)
}

export async function refreshSportsBadges(sport: string, force = true): Promise<void> {
  await refreshSportsBadgesInternal(sport, force)
}

export function getSportsStatus(): SportSyncStatus[] {
  const db = ensureDb()
  return SUPPORTED_SPORTS.map((sport) => getSportSyncStatus(db, sport))
}

export const SportsModule: DataSourceModule = {
  id: 'sports',
  displayName: 'Sports',
  initialize(db: Database.Database): void {
    dbRef = db

    if (!isSportsEnabled()) {
      return
    }

    for (const sport of SUPPORTED_SPORTS) {
      void refreshSportInternal(sport, false).catch((error) => {
        console.error(`[Sports] Initial refresh failed for ${sport}:`, error)
      })
    }

    startPollTimer()
  },
  shutdown(): void {
    stopPollTimer()
    clearLiveRefreshTimers()
    dbRef = null
    badgeRefreshPromises.clear()
    refreshPromises.clear()
  }
}