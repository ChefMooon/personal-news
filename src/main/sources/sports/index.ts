import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import type {
  IpcMutationResult,
  SportEvent,
  SportLeague,
  SportsDataUpdatedEvent,
  SportSyncStatus,
  SportTeamEvents,
  TeamSearchResult,
  TrackedTeam
} from '../../../shared/ipc-types'
import { IPC } from '../../../shared/ipc-types'
import { getSetting } from '../../settings/store'
import type { DataSourceModule } from '../registry'
import {
  fetchTeamDetails,
  fetchLastEventsForTeam,
  fetchLeagueEventsForDate,
  fetchLeaguesForSport,
  fetchNextEventsForTeam,
  fetchTeamDetailsInLeague,
  searchTeams as searchTeamsFromApi
} from './api'
import {
  getCacheMeta,
  getLeagueById,
  getLocalDateString,
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
  upsertCacheMeta,
  upsertEvents,
  upsertLeague,
  upsertTrackedTeam
} from './cache'

const SPORTS_ENABLED_KEY = 'sports_enabled'
const SUPPORTED_SPORTS = ['Baseball'] as const
const DEFAULT_ENABLED_LEAGUE_IDS: Record<string, Set<string>> = {
  Baseball: new Set(['4424'])
}

let dbRef: Database.Database | null = null
const refreshPromises = new Map<string, Promise<void>>()

function ensureDb(): Database.Database {
  if (!dbRef) {
    throw new Error('Sports module not initialized.')
  }

  return dbRef
}

function isSportsEnabled(): boolean {
  return getSetting(SPORTS_ENABLED_KEY) !== 'false'
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

  return sport === 'Baseball' && /major league baseball|\bmlb\b/i.test(league.name)
}

async function ensureLeagueCatalogLoaded(sport: string): Promise<SportLeague[]> {
  const db = ensureDb()
  const existing = listLeagues(db, sport)
  if (existing.length > 0) {
    return existing
  }

  const leagues = await fetchLeaguesForSport(sport)
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

async function refreshTrackedTeam(team: TrackedTeam, fetchedDate: string): Promise<void> {
  const db = ensureDb()
  const [lastEvents, nextEvents] = await Promise.all([
    fetchLastEventsForTeam(team.teamId),
    fetchNextEventsForTeam(team.teamId)
  ])
  upsertEvents(db, [...lastEvents, ...nextEvents], fetchedDate)
}

async function doRefreshSport(sport: string, force: boolean): Promise<void> {
  const db = ensureDb()
  const fetchDate = getLocalDateString()

  if (!force && getCacheMeta(db, sport, fetchDate)) {
    return
  }

  await ensureLeagueCatalogLoaded(sport)

  const enabledLeagues = listEnabledLeagues(db, sport)
  for (const league of enabledLeagues) {
    const events = await fetchLeagueEventsForDate(fetchDate, league.name)
    upsertEvents(db, events, fetchDate)
  }

  const trackedTeams = listTrackedTeams(db, sport)
  for (const team of trackedTeams) {
    await refreshTrackedTeam(team, fetchDate)
  }

  upsertCacheMeta(db, sport, fetchDate, Math.floor(Date.now() / 1000))
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

  emitSportsUpdated({ sport: team?.sport ?? 'Baseball', ok: true, error: null })
  return { ok: true, error: null }
}

export function setSportsTeamEnabled(teamId: string, enabled: boolean): IpcMutationResult {
  const team = getTrackedTeam(ensureDb(), teamId)
  const updated = setTrackedTeamEnabled(ensureDb(), teamId, enabled)
  if (!updated) {
    return { ok: false, error: 'Tracked team not found.' }
  }

  emitSportsUpdated({ sport: team?.sport ?? 'Baseball', ok: true, error: null })
  return { ok: true, error: null }
}

export function setSportsTeamOrder(orderedIds: string[]): IpcMutationResult {
  setTrackedTeamOrder(ensureDb(), orderedIds)
  emitSportsUpdated({ sport: 'Baseball', ok: true, error: null })
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

  emitSportsUpdated({ sport: league?.sport ?? 'Baseball', ok: true, error: null })
  return { ok: true, error: null }
}

export async function searchSportsTeams(query: string, sport: string): Promise<TeamSearchResult[]> {
  return searchTeamsFromApi(query, sport)
}

export async function refreshSportsData(sport: string, force = true): Promise<void> {
  await refreshSportInternal(sport, force)
}

export function getSportsStatus(): SportSyncStatus[] {
  const db = ensureDb()
  return [...SUPPORTED_SPORTS].map((sport) => getSportSyncStatus(db, sport))
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
  },
  shutdown(): void {
    dbRef = null
    refreshPromises.clear()
  }
}