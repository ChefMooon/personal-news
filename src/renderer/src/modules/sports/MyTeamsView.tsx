import React from 'react'
import type { SportEvent, SportTeamEvents, TrackedTeam } from '../../../../shared/ipc-types'
import { getSportLabel } from '../../../../shared/sports'
import { cn } from '../../lib/utils'
import {
  getGamePhase,
  getGamePhaseBadgeClasses,
  getGamePhaseDotClasses,
  getGamePhaseHeadline,
  getGamePhaseLabel,
  hasResolvedScore,
  type GamePhase,
  isLiveStatus
} from './utils'

function formatDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric'
  })
}

function formatDateTime(game: SportEvent, showTime: boolean): string {
  const dateLabel = new Date(`${game.eventDate}T12:00:00`).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
  if (!showTime || !game.eventTime) {
    return dateLabel
  }

  const timeLabel = new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
  return `${dateLabel} ${timeLabel}`
}

function formatTime(game: SportEvent): string {
  if (!game.eventTime) {
    return ''
  }

  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function getTodayString(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getOpponent(game: SportEvent, teamId: string): string {
  return game.homeTeamId === teamId ? game.awayTeam : game.homeTeam
}

function getOpponentBadgeUrl(game: SportEvent, teamId: string): string | null {
  return game.homeTeamId === teamId ? game.awayTeamBadgeUrl : game.homeTeamBadgeUrl
}

function getOutcome(game: SportEvent, teamId: string): 'W' | 'L' | 'T' | null {
  const isHome = game.homeTeamId === teamId
  const teamScore = Number.parseInt(isHome ? game.homeScore ?? '' : game.awayScore ?? '', 10)
  const opponentScore = Number.parseInt(isHome ? game.awayScore ?? '' : game.homeScore ?? '', 10)
  if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) {
    return null
  }

  return teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'T'
}

function getScore(game: SportEvent, teamId: string): string {
  const isHome = game.homeTeamId === teamId
  const teamScore = isHome ? game.homeScore : game.awayScore
  const opponentScore = isHome ? game.awayScore : game.homeScore
  if (!teamScore || !opponentScore) {
    return '—'
  }

  return `${teamScore}-${opponentScore}`
}

function getTodayGame(events: SportTeamEvents | undefined, today: string): SportEvent | null {
  const nextToday = events?.next.find((event) => event.eventDate === today)
  if (nextToday) {
    return nextToday
  }

  return events?.last.find((event) => event.eventDate === today) ?? null
}

function getFirstDifferentGame(events: SportEvent[] | undefined, excludedEventId: string | null): SportEvent | null {
  if (!events) {
    return null
  }

  return events.find((event) => event.eventId !== excludedEventId) ?? null
}

function computeStreak(lastGames: SportEvent[], teamId: string): string {
  if (!lastGames.length) {
    return ''
  }

  const results = lastGames.map((game) => getOutcome(game, teamId))
  const first = results[0]
  if (!first) {
    return ''
  }

  let count = 0
  for (const result of results) {
    if (result === first) {
      count += 1
      continue
    }
    break
  }

  return `${first}${count}`
}

function outcomeClasses(outcome: 'W' | 'L' | 'T' | null): { text: string; bg: string; border: string } {
  if (outcome === 'W') {
    return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
  }
  if (outcome === 'L') {
    return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' }
  }
  if (outcome === 'T') {
    return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
  }
  return { text: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' }
}

function getTeamMeta(team: TrackedTeam, showSportLabels: boolean): string {
  return showSportLabels ? `${getSportLabel(team.sport)} · ${team.leagueId}` : team.leagueId
}

function TeamBadge({ team, size = 'md' }: { team: TrackedTeam; size?: 'sm' | 'md' | 'lg' }): React.ReactElement {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'

  if (team.badgeUrl) {
    return <img src={team.badgeUrl} alt="" className={cn('rounded-full bg-muted object-cover', sizeClass)} />
  }

  return (
    <div className={cn('flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', sizeClass)}>
      {(team.shortName ?? team.name).slice(0, 2).toUpperCase()}
    </div>
  )
}

function OpponentBadge({ name, badgeUrl, size = 'md' }: { name: string; badgeUrl: string | null; size?: 'sm' | 'md' | 'lg' }): React.ReactElement {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'

  if (badgeUrl) {
    return <img src={badgeUrl} alt="" className={cn('rounded-full bg-muted object-cover', sizeClass)} />
  }

  return (
    <div className={cn('flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', sizeClass)}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function GameStateDisplay({
  game,
  teamId,
  showTime,
  scheduledFallback = 'Today'
}: {
  game: SportEvent
  teamId: string
  showTime: boolean
  scheduledFallback?: string
}): React.ReactElement {
  if (isLiveStatus(game.status)) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-red-500 animate-pulse">●</span>
        <span className="text-sm font-semibold tabular-nums">{getScore(game, teamId)}</span>
        <span className="text-xs text-muted-foreground">{game.status ?? 'Live'}</span>
      </div>
    )
  }

  if (getGamePhase(game) === 'finished') {
    const outcome = getOutcome(game, teamId)
    const classes = outcomeClasses(outcome)

    return (
      <div className={cn('text-sm font-semibold tabular-nums', classes.text)}>
        {getScore(game, teamId)}
        {outcome ? ` · ${outcome}` : ''}
      </div>
    )
  }

  return (
    <div className="text-xs text-muted-foreground">
      {showTime && game.eventTime ? formatTime(game) : scheduledFallback}
    </div>
  )
}

type TodayGameDisplayData = {
  phase: GamePhase
  opponent: string
  opponentBadgeUrl: string | null
  isHome: boolean
  outcome: 'W' | 'L' | 'T' | null
  score: string
  primaryText: string
  secondaryText: string
}

function getTodayGameDisplayData(game: SportEvent, teamId: string, showTime: boolean): TodayGameDisplayData {
  const phase = getGamePhase(game)
  const outcome = getOutcome(game, teamId)

  if (phase === 'live') {
    return {
      phase,
      opponent: getOpponent(game, teamId),
      opponentBadgeUrl: getOpponentBadgeUrl(game, teamId),
      isHome: game.homeTeamId === teamId,
      outcome,
      score: getScore(game, teamId),
      primaryText: getScore(game, teamId),
      secondaryText: game.status ?? 'Live'
    }
  }

  if (phase === 'finished') {
    return {
      phase,
      opponent: getOpponent(game, teamId),
      opponentBadgeUrl: getOpponentBadgeUrl(game, teamId),
      isHome: game.homeTeamId === teamId,
      outcome,
      score: getScore(game, teamId),
      primaryText: getScore(game, teamId),
      secondaryText: outcome ? `${outcome} · Final score` : 'Final score'
    }
  }

  return {
    phase,
    opponent: getOpponent(game, teamId),
    opponentBadgeUrl: getOpponentBadgeUrl(game, teamId),
    isHome: game.homeTeamId === teamId,
    outcome,
    score: getScore(game, teamId),
    primaryText: showTime && game.eventTime ? formatTime(game) : 'Today',
    secondaryText: `${formatDateLabel(game.eventDate)} · Today`
  }
}

function getTodayBadgeClasses(game: SportEvent | null): string {
  if (game && getGamePhase(game) === 'scheduled' && game.eventDate === getTodayString()) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  }

  return getGamePhaseBadgeClasses(game)
}

function getTodayDotClasses(game: SportEvent | null): string {
  if (game && getGamePhase(game) === 'scheduled' && game.eventDate === getTodayString()) {
    return 'bg-emerald-400'
  }

  return getGamePhaseDotClasses(game)
}

function SummarizedTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  showTime,
  showSportLabels
}: {
  team: TrackedTeam
  lastGame: SportEvent | null
  todayGame: SportEvent | null
  nextGame: SportEvent | null
  showTime: boolean
  showSportLabels: boolean
}): React.ReactElement {
  const displayGame = todayGame ?? lastGame
  const displayPhase = getGamePhase(displayGame)
  const outcome = displayGame ? getOutcome(displayGame, team.teamId) : null
  const opponent = todayGame ? getOpponent(todayGame, team.teamId) : nextGame ? getOpponent(nextGame, team.teamId) : null

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold">{team.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{getTeamMeta(team, showSportLabels)}</span>
          </div>
          {displayGame ? (
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', getTodayBadgeClasses(displayGame))}>
              {todayGame && displayPhase === 'scheduled' ? 'Today' : getGamePhaseLabel(displayGame)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {todayGame && opponent ? (
            <>
              Today: <span className="text-foreground/80">{opponent}</span> ·
              {' '}
              {displayPhase === 'live'
                ? `${getScore(todayGame, team.teamId)} · ${todayGame.status ?? 'Live'}`
                : displayPhase === 'finished'
                  ? `Final score ${getScore(todayGame, team.teamId)}${outcome ? ` · ${outcome}` : ''}`
                  : showTime && todayGame.eventTime
                      ? `${formatTime(todayGame)} · Today`
                      : 'Today'}
            </>
          ) : nextGame ? (
            <>
              Next: <span className="text-foreground/80">{getOpponent(nextGame, team.teamId)}</span> · {formatDateTime(nextGame, showTime)}
            </>
          ) : 'No upcoming games'}
        </p>
      </div>
    </div>
  )
}

function StandardTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  showTime,
  showVenue,
  showSportLabels
}: {
  team: TrackedTeam
  lastGame: SportEvent | null
  todayGame: SportEvent | null
  nextGame: SportEvent | null
  showTime: boolean
  showVenue: boolean
  showSportLabels: boolean
}): React.ReactElement {
  const displayGame = todayGame && hasResolvedScore(todayGame) ? todayGame : lastGame
  const outcome = displayGame ? getOutcome(displayGame, team.teamId) : null
  const classes = outcomeClasses(outcome)

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 border-b bg-muted/20 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{getTeamMeta(team, showSportLabels)}</p>
        </div>
        {displayGame && outcome ? (
          <div className={cn('flex shrink-0 flex-col items-center rounded-md px-2.5 py-1', classes.bg)}>
            <span className={cn('text-base font-extrabold leading-none', classes.text)}>{outcome}</span>
            <span className={cn('text-[10px] font-semibold', classes.text)}>{getScore(displayGame, team.teamId)}</span>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 divide-x text-xs">
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last Game</p>
          {lastGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">vs. {getOpponent(lastGame, team.teamId)}</p>
              <p className="text-muted-foreground">{formatDateLabel(lastGame.eventDate)}</p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No recent games</p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{todayGame ? 'Today' : 'Next Game'}</p>
          {todayGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">vs. {getOpponent(todayGame, team.teamId)}</p>
              <div className="mt-1">
                <GameStateDisplay game={todayGame} teamId={team.teamId} showTime={showTime} />
              </div>
              {showVenue && todayGame.venue ? <p className="text-muted-foreground">{todayGame.venue}</p> : null}
            </>
          ) : nextGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">vs. {getOpponent(nextGame, team.teamId)}</p>
              <p className="text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? ` · ${nextGame.venue}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No upcoming games</p>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailedTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  streak,
  showTime,
  showVenue,
  showSportLabels
}: {
  team: TrackedTeam
  lastGame: SportEvent | null
  todayGame: SportEvent | null
  nextGame: SportEvent | null
  streak: string
  showTime: boolean
  showVenue: boolean
  showSportLabels: boolean
}): React.ReactElement {
  const featuredGame = todayGame ?? lastGame
  const outcome = featuredGame ? getOutcome(featuredGame, team.teamId) : null
  const classes = outcomeClasses(outcome)
  const streakIsWin = streak.startsWith('W')

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 border-b px-3 py-3">
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{getTeamMeta(team, showSportLabels)}</p>
        </div>
        {streak ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Streak</p>
            <p className={cn('text-sm font-extrabold', streakIsWin ? 'text-emerald-400' : 'text-red-400')}>
              {streak}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        {outcome ? (
          <div className={cn('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border', classes.bg, classes.border)}>
            <span className={cn('text-sm font-extrabold leading-none', classes.text)}>{outcome}</span>
            <span className={cn('text-[10px] font-semibold', classes.text)}>{featuredGame ? getScore(featuredGame, team.teamId) : ''}</span>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {todayGame ? 'Today' : 'Last Game'}{featuredGame ? ` · ${formatDateLabel(featuredGame.eventDate)}` : ''}
          </p>
          {featuredGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">vs. {getOpponent(featuredGame, team.teamId)}</p>
              {todayGame ? (
                <div className="mt-1">
                  <GameStateDisplay game={todayGame} teamId={team.teamId} showTime={showTime} />
                </div>
              ) : outcome ? (
                <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', classes.text, classes.bg)}>
                  {outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : 'Tie'}
                </span>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No recent games</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 bg-muted/10 px-3 py-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-muted bg-muted/30 text-[11px] font-semibold text-muted-foreground">
          NEXT
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{todayGame ? 'Up Next' : 'Next Game'}</p>
          {nextGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">vs. {getOpponent(nextGame, team.teamId)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? ` · ${nextGame.venue}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No upcoming games scheduled</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TodayGameCard({
  team,
  todayGame,
  lastGame,
  showTime,
  showVenue,
  showSportLabels
}: {
  team: TrackedTeam
  todayGame: SportEvent | null
  lastGame: SportEvent | null
  showTime: boolean
  showVenue: boolean
  showSportLabels: boolean
}): React.ReactElement {
  const priorGame = lastGame && lastGame.eventId !== todayGame?.eventId ? lastGame : null
  const outcome = todayGame ? getOutcome(todayGame, team.teamId) : null
  const classes = outcomeClasses(outcome)
  const todayGameDisplay = todayGame ? getTodayGameDisplayData(todayGame, team.teamId, showTime) : null
  const phase = todayGameDisplay?.phase ?? getGamePhase(todayGame)
  const opponent = todayGameDisplay?.opponent ?? null
  const opponentBadgeUrl = todayGameDisplay?.opponentBadgeUrl ?? null
  const isHome = todayGameDisplay?.isHome ?? false
  const hasVenue = showVenue && Boolean(todayGame?.venue)
  const hasLastGame = Boolean(priorGame)

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/5">
      <div className="flex items-center gap-3 border-b border-emerald-500/10 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{getTeamMeta(team, showSportLabels)}</p>
        </div>
        <div className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5', getTodayBadgeClasses(todayGame))}>
          <span className={cn('h-1.5 w-1.5 rounded-full', getTodayDotClasses(todayGame))} />
          <span className="text-[10px] font-bold uppercase tracking-wide">{phase === 'scheduled' ? 'Today' : getGamePhaseLabel(todayGame)}</span>
        </div>
      </div>

      {todayGame ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-3 text-center">
          <div>
            <div className="mx-auto w-fit">
              <TeamBadge team={team} size="lg" />
            </div>
            <p className="mt-1 text-xs font-semibold">{team.shortName ?? team.name}</p>
            <p className="text-[10px] text-muted-foreground">{isHome ? 'Home' : 'Away'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {phase === 'scheduled' ? 'Today' : getGamePhaseHeadline(todayGame)}
            </p>
            {phase === 'live' ? (
              <>
                <p className="mt-1 text-base font-extrabold tracking-tight tabular-nums">{todayGameDisplay?.primaryText ?? getScore(todayGame, team.teamId)}</p>
                <p className="text-[10px] text-red-500">{todayGameDisplay?.secondaryText ?? (todayGame?.status ?? 'Live')}</p>
              </>
            ) : phase === 'finished' ? (
              <>
                <p className={cn('mt-1 text-base font-extrabold tracking-tight tabular-nums', classes.text)}>{todayGameDisplay?.primaryText ?? getScore(todayGame, team.teamId)}</p>
                <p className={cn('text-[10px]', classes.text)}>{todayGameDisplay?.secondaryText ?? (outcome ? `${outcome} · Final score` : 'Final score')}</p>
              </>
            ) : (
              <>
                <p className="mt-1 text-base font-extrabold tracking-tight">
                  {todayGameDisplay?.primaryText ?? (showTime && todayGame?.eventTime ? formatTime(todayGame) : 'Today')}
                </p>
                <p className="text-[10px] text-muted-foreground">{todayGameDisplay?.secondaryText ?? (todayGame ? `${formatDateLabel(todayGame.eventDate)} · Today` : 'Today')}</p>
              </>
            )}
          </div>
          <div>
            <div className="mx-auto w-fit">
              <OpponentBadge name={opponent ?? '--'} badgeUrl={opponentBadgeUrl} size="lg" />
            </div>
            <p className="mt-1 text-xs font-semibold">{opponent}</p>
            <p className="text-[10px] text-muted-foreground">{isHome ? 'Opponent' : 'At'}</p>
          </div>
        </div>
      ) : null}

      {(hasVenue || hasLastGame) ? (
        <div className={cn('grid border-t bg-muted/10 text-xs', hasVenue && hasLastGame ? 'grid-cols-2 divide-x' : 'grid-cols-1')}>
          {hasVenue ? (
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Venue</p>
              <p className="mt-0.5 text-foreground/80">{todayGame?.venue}</p>
            </div>
          ) : null}
          {hasLastGame ? (
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last Result</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                {priorGame ? (
                  <>
                    {getOutcome(priorGame, team.teamId) ? (
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        outcomeClasses(getOutcome(priorGame, team.teamId)).text,
                        outcomeClasses(getOutcome(priorGame, team.teamId)).bg
                      )}>
                        {getOutcome(priorGame, team.teamId)}
                      </span>
                    ) : null}
                    <span className="text-foreground/80">{getScore(priorGame, team.teamId)}</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TodayRestingRow({
  team,
  nextGame,
  showTime,
  showSportLabels
}: {
  team: TrackedTeam
  nextGame: SportEvent | null
  showTime: boolean
  showSportLabels: boolean
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 opacity-40">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-muted-foreground">{team.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{getTeamMeta(team, showSportLabels)}</p>
        <p className="text-xs text-muted-foreground">
          {nextGame ? (
            <>
              Next: {getOpponent(nextGame, team.teamId)} · {formatDateTime(nextGame, showTime)}
            </>
          ) : 'No upcoming games'}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground/50">-</span>
    </div>
  )
}

function TodayView({
  teams,
  teamEventsById,
  showVenue,
  showTime,
  today,
  showSportLabels
}: {
  teams: TrackedTeam[]
  teamEventsById: Record<string, SportTeamEvents>
  showVenue: boolean
  showTime: boolean
  today: string
  showSportLabels: boolean
}): React.ReactElement {
  const playing = teams.filter((team) => getTodayGame(teamEventsById[team.teamId], today) !== null)
  const resting = teams.filter((team) => getTodayGame(teamEventsById[team.teamId], today) === null)

  if (playing.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          None of your teams are playing today.
        </div>
        {resting.length > 0 ? (
          <div className="space-y-1.5">
            {resting.map((team) => {
              const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null
              return (
                <TodayRestingRow
                  key={team.teamId}
                  team={team}
                  nextGame={nextGame}
                  showTime={showTime}
                  showSportLabels={showSportLabels}
                />
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {playing.map((team) => {
        const events = teamEventsById[team.teamId]
        const todayGame = getTodayGame(events, today)
        const lastGame = getFirstDifferentGame(events?.last, todayGame?.eventId ?? null)
        return (
          <TodayGameCard
            key={team.teamId}
            team={team}
            todayGame={todayGame}
            lastGame={lastGame}
            showTime={showTime}
            showVenue={showVenue}
            showSportLabels={showSportLabels}
          />
        )
      })}

      {resting.length > 0 ? (
        <div>
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">No game today</p>
          <div className="space-y-1.5">
            {resting.map((team) => {
              const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null
              return (
                <TodayRestingRow
                  key={team.teamId}
                  team={team}
                  nextGame={nextGame}
                  showTime={showTime}
                  showSportLabels={showSportLabels}
                />
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function MyTeamsView({
  teams,
  teamEventsById,
  showVenue,
  showTime,
  viewMode,
  showSportLabels = false
}: {
  teams: TrackedTeam[]
  teamEventsById: Record<string, SportTeamEvents>
  showVenue: boolean
  showTime: boolean
  viewMode: 'today' | 'summarized' | 'standard' | 'detailed'
  showSportLabels?: boolean
}): React.ReactElement {
  const today = getTodayString()

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No tracked teams yet. Add teams from Settings → Sports.
      </div>
    )
  }

  if (viewMode === 'today') {
    return (
      <TodayView
        teams={teams}
        teamEventsById={teamEventsById}
        showVenue={showVenue}
        showTime={showTime}
        today={today}
        showSportLabels={showSportLabels}
      />
    )
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const events = teamEventsById[team.teamId]
        const todayGame = getTodayGame(events, today)
        const lastGame = getFirstDifferentGame(events?.last, todayGame?.eventId ?? null)
        const nextGame = getFirstDifferentGame(events?.next, todayGame?.eventId ?? null)
        const streak = computeStreak(events?.last ?? [], team.teamId)

        if (viewMode === 'summarized') {
          return (
            <SummarizedTeamCard
              key={team.teamId}
              team={team}
              lastGame={lastGame}
              todayGame={todayGame}
              nextGame={nextGame}
              showTime={showTime}
              showSportLabels={showSportLabels}
            />
          )
        }

        if (viewMode === 'standard') {
          return (
            <StandardTeamCard
              key={team.teamId}
              team={team}
              lastGame={lastGame}
              todayGame={todayGame}
              nextGame={nextGame}
              showTime={showTime}
              showVenue={showVenue}
              showSportLabels={showSportLabels}
            />
          )
        }

        return (
          <DetailedTeamCard
            key={team.teamId}
            team={team}
            lastGame={lastGame}
            todayGame={todayGame}
            nextGame={nextGame}
            streak={streak}
            showTime={showTime}
            showVenue={showVenue}
            showSportLabels={showSportLabels}
          />
        )
      })}
    </div>
  )
}

export default MyTeamsView