import type { SportLeague, TrackedTeam } from '../../../../shared/ipc-types'
import { getSportLabel } from '../../../../shared/sports'

export type LeaguesById = Record<string, SportLeague>

export function getLeagueKey(sport: string, leagueId: string): string {
  return `${sport}:${leagueId}`
}

export function getLeagueLabel({
  sport,
  leagueId,
  leaguesById,
  fallbackLabel
}: {
  sport: string
  leagueId: string
  leaguesById: LeaguesById
  fallbackLabel?: string | null
}): string {
  return fallbackLabel?.trim() || leaguesById[getLeagueKey(sport, leagueId)]?.name || leagueId
}

export function getTrackedTeamMeta(
  team: TrackedTeam,
  leaguesById: LeaguesById,
  showSportLabels: boolean
): string {
  const leagueLabel = getLeagueLabel({
    sport: team.sport,
    leagueId: team.leagueId,
    leaguesById
  })

  return showSportLabels ? `${getSportLabel(team.sport)} · ${leagueLabel}` : leagueLabel
}