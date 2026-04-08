import type { SportEvent, SportStandingRow } from '../../../../shared/ipc-types'
import { getGamePhase, isLiveStatus } from './utils'

export type TeamOutcome = 'W' | 'L' | 'D'

export function getCurrentSeason(sport: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  switch (sport) {
    case 'Baseball':
      return String(year)
    case 'Basketball':
      return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`
    case 'Ice Hockey':
      return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`
    default:
      return String(year)
  }
}

export function getEventStartAt(event: SportEvent): number {
  const value = Date.parse(`${event.eventDate}T${event.eventTime ?? '12:00'}:00Z`)
  return Number.isNaN(value) ? 0 : value
}

export function getLocalDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isEventOnLocalDate(event: SportEvent, value = new Date()): boolean {
  const eventStartAt = getEventStartAt(event)
  if (eventStartAt <= 0) {
    return false
  }

  return getLocalDateKey(new Date(eventStartAt)) === getLocalDateKey(value)
}

export function filterEventsForLocalDate(events: SportEvent[], value = new Date()): SportEvent[] {
  return events.filter((event) => isEventOnLocalDate(event, value))
}

export function getClosestEventToNow(events: SportEvent[], now = Date.now()): SportEvent | null {
  if (events.length === 0) {
    return null
  }

  return [...events].sort((left, right) => {
    const leftDistance = Math.abs(getEventStartAt(left) - now)
    const rightDistance = Math.abs(getEventStartAt(right) - now)

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }

    return sortSportsPageEvents(left, right)
  })[0] ?? null
}

export function getClosestScheduledEventToNow(events: SportEvent[], now = Date.now()): SportEvent | null {
  const scheduledEvents = events.filter((event) => getGamePhase(event) === 'scheduled')
  return getClosestEventToNow(scheduledEvents.length > 0 ? scheduledEvents : events, now)
}

export function sortSportsPageEvents(left: SportEvent, right: SportEvent): number {
  const rank = (event: SportEvent): number => {
    const phase = getGamePhase(event)
    if (phase === 'live') {
      return 0
    }
    if (phase === 'scheduled') {
      return 1
    }
    return 2
  }

  const rankDiff = rank(left) - rank(right)
  if (rankDiff !== 0) {
    return rankDiff
  }

  const timeDiff = getEventStartAt(left) - getEventStartAt(right)
  if (timeDiff !== 0) {
    return timeDiff
  }

  return `${left.awayTeam}${left.homeTeam}`.localeCompare(`${right.awayTeam}${right.homeTeam}`)
}

export function formatEventTime(event: SportEvent): string {
  if (!event.eventTime) {
    return 'TBD'
  }

  return new Date(`${event.eventDate}T${event.eventTime}:00Z`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatEventDateTime(event: SportEvent): string {
  const date = new Date(`${event.eventDate}T${event.eventTime ?? '12:00'}:00Z`)
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: event.eventTime ? 'numeric' : undefined,
    minute: event.eventTime ? '2-digit' : undefined
  })
}

export function formatMatchup(event: SportEvent): string {
  return `${event.awayTeam} vs ${event.homeTeam}`
}

export function getTeamInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'TM'
}

export function getOutcomeForTeam(event: SportEvent, teamId: string): TeamOutcome | null {
  const isHome = event.homeTeamId === teamId
  const teamScore = Number.parseInt(isHome ? event.homeScore ?? '' : event.awayScore ?? '', 10)
  const opponentScore = Number.parseInt(isHome ? event.awayScore ?? '' : event.homeScore ?? '', 10)
  if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) {
    return null
  }

  if (teamScore === opponentScore) {
    return 'D'
  }

  return teamScore > opponentScore ? 'W' : 'L'
}

export function getRecentOutcomes(events: SportEvent[], teamId: string): TeamOutcome[] {
  return [...events]
    .sort((left, right) => getEventStartAt(right) - getEventStartAt(left))
    .map((event) => getOutcomeForTeam(event, teamId))
    .filter((outcome): outcome is TeamOutcome => outcome !== null)
    .slice(0, 5)
}

export function getStreakLabel(outcomes: TeamOutcome[]): string | null {
  if (outcomes.length === 0) {
    return null
  }

  const [first] = outcomes
  let count = 0
  for (const outcome of outcomes) {
    if (outcome !== first) {
      break
    }
    count += 1
  }

  return `${first}${count}`
}

export function getRecordLabel(standing: SportStandingRow | null, outcomes: TeamOutcome[]): string {
  if (standing) {
    return standing.draw > 0 ? `${standing.win}-${standing.loss}-${standing.draw}` : `${standing.win}-${standing.loss}`
  }

  const wins = outcomes.filter((outcome) => outcome === 'W').length
  const losses = outcomes.filter((outcome) => outcome === 'L').length
  const draws = outcomes.filter((outcome) => outcome === 'D').length
  return draws > 0 ? `${wins}-${losses}-${draws}` : `${wins}-${losses}`
}

export function getStatusText(event: SportEvent): string {
  if (isLiveStatus(event.status)) {
    return event.status ?? 'Live'
  }

  if (getGamePhase(event) === 'finished') {
    return 'Final'
  }

  return formatEventTime(event)
}

export function getStandingFormTokens(form: string | null): TeamOutcome[] {
  if (!form) {
    return []
  }

  return form
    .toUpperCase()
    .replace(/[^WDLT]/g, '')
    .split('')
    .map((token) => (token === 'T' ? 'D' : token))
    .filter((token): token is TeamOutcome => token === 'W' || token === 'L' || token === 'D')
}