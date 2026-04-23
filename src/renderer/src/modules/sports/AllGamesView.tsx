import React, { useMemo } from 'react'
import { Badge } from '../../components/ui/badge'
import type { SportEvent, SportLeague } from '../../../../shared/ipc-types'
import { getLocalDateKey, isSportEventOnLocalDate } from '../../../../shared/sports-event-utils'
import { getSportLabel } from '../../../../shared/sports'
import { GameCard } from './GameCard'
import { getLeagueLabel } from './league-display'
import { TeamAvatar } from './TeamAvatar'
import {
  getGamePhase,
  getGamePhaseBadgeClasses,
  getGamePhaseLabel,
  isLiveStatus
} from './utils'

function formatEventTime(game: SportEvent): string {
  if (!game.eventTime) {
    return 'TBD'
  }

  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

function sortEvents(a: SportEvent, b: SportEvent): number {
  const rank = (event: SportEvent): number => {
    const phase = getGamePhase(event)
    if (phase === 'live') return 0
    if (phase === 'scheduled') return 1
    return 2
  }

  const rankDiff = rank(a) - rank(b)
  if (rankDiff !== 0) {
    return rankDiff
  }

  const aTime = Date.parse(`${a.eventDate}T${a.eventTime ?? '12:00'}:00Z`)
  const bTime = Date.parse(`${b.eventDate}T${b.eventTime ?? '12:00'}:00Z`)
  if (aTime !== bTime) {
    return aTime - bTime
  }

  return a.homeTeam.localeCompare(b.homeTeam)
}

function TeamLines({ game }: { game: SportEvent }): React.ReactElement {
  const finished = getGamePhase(game) === 'finished'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <TeamAvatar name={game.awayTeam} src={game.awayTeamBadgeUrl} className="h-7 w-7 rounded-full" fallbackClassName="text-[10px]" />
        <span className="truncate text-sm font-medium">
          {game.awayTeam}
          {finished ? ` ${game.awayScore ?? '—'}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <TeamAvatar name={game.homeTeam} src={game.homeTeamBadgeUrl} className="h-7 w-7 rounded-full" fallbackClassName="text-[10px]" />
        <span className="truncate text-sm font-medium">
          {game.homeTeam}
          {finished ? ` ${game.homeScore ?? '—'}` : ''}
        </span>
      </div>
    </div>
  )
}

function getTodayBadgeClasses(game: SportEvent): string {
  if (getGamePhase(game) === 'scheduled' && isSportEventOnLocalDate(game.eventDate, game.eventTime, getLocalDateKey(new Date()))) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
  }

  return getGamePhaseBadgeClasses(game)
}

export function AllGamesView({
  events,
  leaguesById,
  showTime,
  showVenue,
  showLiveStartTime,
  fallbackEvents,
  showSportLabels = false
}: {
  events: SportEvent[]
  leaguesById: Record<string, SportLeague>
  showTime: boolean
  showVenue: boolean
  showLiveStartTime: boolean
  fallbackEvents: SportEvent[]
  showSportLabels?: boolean
}): React.ReactElement {
  const grouped = useMemo(() => {
    const groups = new Map<string, SportEvent[]>()
    for (const event of [...events].sort(sortEvents)) {
      const groupKey = `${event.sport}:${event.leagueId}`
      const list = groups.get(groupKey)
      if (list) {
        list.push(event)
      } else {
        groups.set(groupKey, [event])
      }
    }
    return Array.from(groups.entries())
  }, [events])

  if (events.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No games today for the enabled leagues.
        </div>
        {fallbackEvents.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next up</p>
            {fallbackEvents.slice(0, 5).map((game) => {
              const isLive = getGamePhase(game) === 'live'
              const showStartTime = showLiveStartTime && isLive && !!game.eventTime
              const detailsLabel = showStartTime
                ? showVenue && game.venue
                  ? `${formatEventTime(game)} · ${game.venue}`
                  : formatEventTime(game)
                : showVenue && game.venue
                  ? game.venue
                  : null

              return (
              <GameCard
                key={game.eventId}
                header={
                  <>
                    <div>
                      <TeamLines game={game} />
                      {detailsLabel ? <p className="text-xs text-muted-foreground">{detailsLabel}</p> : null}
                      {showSportLabels ? <p className="text-xs text-muted-foreground">{getSportLabel(game.sport)}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant="secondary" className={getGamePhaseBadgeClasses(game)}>
                        {getGamePhaseLabel(game)}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">{showTime ? formatEventTime(game) : game.eventDate}</p>
                    </div>
                  </>
                }
              />
            )})}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(([leagueKey, leagueEvents]) => {
        const league = leaguesById[leagueKey]
        return (
        <section key={leagueKey} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">
              {getLeagueLabel({
                sport: league?.sport ?? leagueEvents[0]?.sport ?? '',
                leagueId: league?.leagueId ?? leagueEvents[0]?.leagueId ?? leagueKey,
                leaguesById,
                fallbackLabel: league?.name ?? null
              })}
            </h3>
            {showSportLabels ? <Badge variant="outline">{getSportLabel(league?.sport ?? leagueEvents[0]?.sport ?? '')}</Badge> : null}
            {league?.country ? (
              <span className="text-xs text-muted-foreground">{league.country}</span>
            ) : null}
          </div>
          <div className="space-y-2">
            {leagueEvents.map((game) => {
              const isLive = getGamePhase(game) === 'live'
              const showStartTime = showLiveStartTime && isLive && !!game.eventTime
              const detailsLabel = showStartTime
                ? showVenue && game.venue
                  ? `${formatEventTime(game)} · ${game.venue}`
                  : formatEventTime(game)
                : showVenue && game.venue
                  ? game.venue
                  : null

              return (
              <GameCard
                key={game.eventId}
                tone={isLiveStatus(game.status) ? 'live' : 'default'}
                header={
                  <>
                    <div className="min-w-0">
                      <TeamLines game={game} />
                      {detailsLabel ? <p className="text-xs text-muted-foreground">{detailsLabel}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant="secondary" className={getTodayBadgeClasses(game)}>
                        {getGamePhase(game) === 'scheduled' ? 'Today' : getGamePhaseLabel(game)}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getGamePhase(game) === 'live'
                          ? game.status ?? 'Live'
                          : getGamePhase(game) === 'finished'
                            ? 'Final score'
                            : showTime
                              ? `${formatEventTime(game)} · Today`
                              : 'Today'}
                      </p>
                    </div>
                  </>
                }
                footer={getGamePhase(game) === 'scheduled' && showTime ? `Date: ${game.eventDate}` : undefined}
              />
            )})}
          </div>
        </section>
      )})}
    </div>
  )
}

export default AllGamesView