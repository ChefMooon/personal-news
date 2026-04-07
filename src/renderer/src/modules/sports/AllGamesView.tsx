import React, { useMemo } from 'react'
import { Badge } from '../../components/ui/badge'
import type { SportEvent, SportLeague } from '../../../../shared/ipc-types'
import { GameCard } from './GameCard'

function isFinishedStatus(status: string | null): boolean {
  return Boolean(status && /(finished|final|completed|game over|ended|after penalties|after extra time)/i.test(status))
}

function isLiveStatus(status: string | null): boolean {
  return Boolean(status && /(live|in progress|inning|quarter|period|half|overtime|extra time)/i.test(status))
}

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
    if (isLiveStatus(event.status)) return 0
    if (isFinishedStatus(event.status)) return 2
    return 1
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

function renderGameLine(game: SportEvent): string {
  if (isFinishedStatus(game.status)) {
    return `${game.awayTeam} ${game.awayScore ?? '—'} · ${game.homeTeam} ${game.homeScore ?? '—'}`
  }

  return `${game.awayTeam} · ${game.homeTeam}`
}

export function AllGamesView({
  events,
  leaguesById,
  showTime,
  showVenue,
  fallbackEvents
}: {
  events: SportEvent[]
  leaguesById: Record<string, SportLeague>
  showTime: boolean
  showVenue: boolean
  fallbackEvents: SportEvent[]
}): React.ReactElement {
  const grouped = useMemo(() => {
    const groups = new Map<string, SportEvent[]>()
    for (const event of [...events].sort(sortEvents)) {
      const list = groups.get(event.leagueId)
      if (list) {
        list.push(event)
      } else {
        groups.set(event.leagueId, [event])
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
            {fallbackEvents.slice(0, 5).map((game) => (
              <GameCard
                key={game.eventId}
                header={
                  <>
                    <div>
                      <p className="text-sm font-medium">{renderGameLine(game)}</p>
                      {showVenue && game.venue ? <p className="text-xs text-muted-foreground">{game.venue}</p> : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{showTime ? formatEventTime(game) : game.eventDate}</span>
                  </>
                }
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(([leagueId, leagueEvents]) => (
        <section key={leagueId} className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{leaguesById[leagueId]?.name ?? leagueId}</h3>
            {leaguesById[leagueId]?.country ? (
              <span className="text-xs text-muted-foreground">{leaguesById[leagueId].country}</span>
            ) : null}
          </div>
          <div className="space-y-2">
            {leagueEvents.map((game) => (
              <GameCard
                key={game.eventId}
                tone={isLiveStatus(game.status) ? 'live' : 'default'}
                header={
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{renderGameLine(game)}</p>
                      {showVenue && game.venue ? <p className="text-xs text-muted-foreground">{game.venue}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {isLiveStatus(game.status) ? (
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          In Progress
                        </Badge>
                      ) : null}
                      {!isLiveStatus(game.status) ? (
                        <span className="text-xs text-muted-foreground">
                          {isFinishedStatus(game.status)
                            ? game.status ?? 'Final'
                            : showTime
                              ? formatEventTime(game)
                              : game.status ?? 'Scheduled'}
                        </span>
                      ) : null}
                    </div>
                  </>
                }
                footer={showTime && !isFinishedStatus(game.status) && !isLiveStatus(game.status) ? `Date: ${game.eventDate}` : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export default AllGamesView