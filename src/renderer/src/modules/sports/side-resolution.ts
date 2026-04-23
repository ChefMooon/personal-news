import type { SportEvent, SportTeamEvents } from '../../../../shared/ipc-types'
import { isSportEventOnLocalDate } from '../../../../shared/sports-event-utils'

export function normalizeTeamKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function resolveTrackedTeamSide(
  game: SportEvent,
  teamId: string,
  teamName?: string | null
): 'home' | 'away' | null {
  if (game.homeTeamId === teamId) {
    return 'home'
  }

  if (game.awayTeamId === teamId) {
    return 'away'
  }

  const normalizedTeamName = normalizeTeamKey(teamName)
  if (!normalizedTeamName) {
    return null
  }

  const homeMatches = normalizeTeamKey(game.homeTeam) === normalizedTeamName
  const awayMatches = normalizeTeamKey(game.awayTeam) === normalizedTeamName
  if (homeMatches === awayMatches) {
    return null
  }

  return homeMatches ? 'home' : 'away'
}

export function getTodayGame(events: SportTeamEvents | undefined, today: string): SportEvent | null {
  const nextToday = events?.next.find((event) => isSportEventOnLocalDate(event.eventDate, event.eventTime, today))
  if (nextToday) {
    return nextToday
  }

  return events?.last.find((event) => isSportEventOnLocalDate(event.eventDate, event.eventTime, today)) ?? null
}
