import { ipcMain } from 'electron'
import type { IpcMutationResult, SportLeague, SportSyncStatus, TeamSearchResult, TrackedTeam } from '../../../shared/ipc-types'
import { IPC } from '../../../shared/ipc-types'
import {
  addSportsLeague,
  addSportsTeam,
  getSportsLeagues,
  getSportsStatus,
  getSportsTeamEvents,
  getSportsTodayEvents,
  getSportsTrackedTeams,
  refreshSportsData,
  removeSportsLeague,
  removeSportsTeam,
  searchSportsTeams,
  setSportsTeamEnabled,
  setSportsTeamOrder
} from './index'

export function registerSportsIpcHandlers(): void {
  ipcMain.handle(IPC.SPORTS_GET_TODAY_EVENTS, (_event, args: { sport: string }) => {
    return getSportsTodayEvents(args.sport)
  })

  ipcMain.handle(IPC.SPORTS_GET_TEAM_EVENTS, (_event, args: { teamId: string }) => {
    return getSportsTeamEvents(args.teamId)
  })

  ipcMain.handle(IPC.SPORTS_GET_TRACKED_TEAMS, (): TrackedTeam[] => {
    return getSportsTrackedTeams()
  })

  ipcMain.handle(
    IPC.SPORTS_ADD_TEAM,
    async (
      _event,
      args: {
        teamId: string
        leagueId: string
        sport: string
        teamName?: string
        leagueName?: string
        badgeUrl?: string | null
      }
    ): Promise<TrackedTeam> => {
      return addSportsTeam(args.teamId, args.leagueId, args.sport, {
        teamName: args.teamName,
        leagueName: args.leagueName,
        badgeUrl: args.badgeUrl ?? null
      })
    }
  )

  ipcMain.handle(IPC.SPORTS_REMOVE_TEAM, (_event, args: { teamId: string }): IpcMutationResult => {
    return removeSportsTeam(args.teamId)
  })

  ipcMain.handle(IPC.SPORTS_SET_TEAM_ENABLED, (_event, args: { teamId: string; enabled: boolean }): IpcMutationResult => {
    return setSportsTeamEnabled(args.teamId, args.enabled)
  })

  ipcMain.handle(IPC.SPORTS_SET_TEAM_ORDER, (_event, args: { orderedIds: string[] }): IpcMutationResult => {
    return setSportsTeamOrder(args.orderedIds)
  })

  ipcMain.handle(IPC.SPORTS_GET_LEAGUES, async (_event, args: { sport: string }): Promise<SportLeague[]> => {
    return getSportsLeagues(args.sport)
  })

  ipcMain.handle(IPC.SPORTS_ADD_LEAGUE, async (_event, args: { leagueId: string; sport: string }): Promise<SportLeague> => {
    return addSportsLeague(args.leagueId, args.sport)
  })

  ipcMain.handle(IPC.SPORTS_REMOVE_LEAGUE, (_event, args: { leagueId: string }): IpcMutationResult => {
    return removeSportsLeague(args.leagueId)
  })

  ipcMain.handle(IPC.SPORTS_SEARCH_TEAMS, async (_event, args: { query: string; sport: string }): Promise<TeamSearchResult[]> => {
    return searchSportsTeams(args.query, args.sport)
  })

  ipcMain.handle(IPC.SPORTS_REFRESH, async (_event, args: { sport: string }): Promise<IpcMutationResult> => {
    try {
      await refreshSportsData(args.sport, true)
      return { ok: true, error: null }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to refresh sports data.'
      }
    }
  })

  ipcMain.handle(IPC.SPORTS_GET_STATUS, (): SportSyncStatus[] => {
    return getSportsStatus()
  })
}