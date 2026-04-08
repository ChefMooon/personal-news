import type { SportEvent } from '../../../../shared/ipc-types'

export function isFinishedStatus(status: string | null): boolean {
  return Boolean(status && /(finished|final|completed|game over|ended|after penalties|after extra time)/i.test(status))
}

export function hasResolvedScore(game: SportEvent | null): boolean {
  if (!game) {
    return false
  }

  const homeScore = Number.parseInt(game.homeScore ?? '', 10)
  const awayScore = Number.parseInt(game.awayScore ?? '', 10)
  return Number.isFinite(homeScore) && Number.isFinite(awayScore)
}

export function isLiveStatus(status: string | null): boolean {
  return Boolean(
    status
      && !isFinishedStatus(status)
      && /(live|in progress|half time|break|period|quarter|inning|set \d|overtime|extra time)/i.test(status)
  )
}

export type GamePhase = 'scheduled' | 'live' | 'finished'

export function getEventStartAt(game: SportEvent | null): number | null {
  if (!game) {
    return null
  }

  const time = game.eventTime ?? '12:00'
  const timestamp = Date.parse(`${game.eventDate}T${time}:00Z`)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function getGamePhase(game: SportEvent | null): GamePhase {
  if (!game) {
    return 'scheduled'
  }

  if (isLiveStatus(game.status)) {
    return 'live'
  }

  if (isFinishedStatus(game.status) || hasResolvedScore(game)) {
    return 'finished'
  }

  return 'scheduled'
}

export function getGamePhaseLabel(game: SportEvent | null): string {
  const phase = getGamePhase(game)
  if (phase === 'live') {
    return 'Live'
  }

  if (phase === 'finished') {
    return 'Finished'
  }

  return 'Scheduled'
}

export function getGamePhaseHeadline(game: SportEvent | null): string {
  const phase = getGamePhase(game)
  if (phase === 'live') {
    return 'Live'
  }

  if (phase === 'finished') {
    return 'Finished'
  }

  return 'Scheduled'
}

export function getGamePhaseBadgeClasses(game: SportEvent | null): string {
  const phase = getGamePhase(game)
  if (phase === 'live') {
    return 'border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-300'
  }

  if (phase === 'finished') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  }

  return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300'
}

export function getGamePhaseDotClasses(game: SportEvent | null): string {
  const phase = getGamePhase(game)
  if (phase === 'live') {
    return 'bg-red-400 animate-pulse'
  }

  if (phase === 'finished') {
    return 'bg-emerald-400'
  }

  return 'bg-sky-400'
}
