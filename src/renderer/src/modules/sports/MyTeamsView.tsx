import React from 'react'
import type { SportEvent, SportTeamEvents, TrackedTeam } from '../../../../shared/ipc-types'
import { GameCard } from './GameCard'

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

function getOpponent(game: SportEvent, teamId: string): string {
  return game.homeTeamId === teamId ? game.awayTeam : game.homeTeam
}

function getResultLine(game: SportEvent, teamId: string): string {
  const isHome = game.homeTeamId === teamId
  const teamScore = Number.parseInt(isHome ? game.homeScore ?? '' : game.awayScore ?? '', 10)
  const opponentScore = Number.parseInt(isHome ? game.awayScore ?? '' : game.homeScore ?? '', 10)
  const outcome =
    Number.isFinite(teamScore) && Number.isFinite(opponentScore)
      ? teamScore > opponentScore
        ? 'W'
        : teamScore < opponentScore
          ? 'L'
          : 'T'
      : 'Result'

  return `${outcome} ${Number.isFinite(teamScore) ? teamScore : '—'}-${Number.isFinite(opponentScore) ? opponentScore : '—'} vs. ${getOpponent(game, teamId)} (${formatDateLabel(game.eventDate)})`
}

function getNextLine(game: SportEvent, teamId: string, showTime: boolean, showVenue: boolean): string {
  const venue = showVenue && game.venue ? ` • ${game.venue}` : ''
  return `vs. ${getOpponent(game, teamId)} • ${formatDateTime(game, showTime)}${venue}`
}

function TeamBadge({ team }: { team: TrackedTeam }): React.ReactElement {
  if (team.badgeUrl) {
    return <img src={team.badgeUrl} alt="" className="h-9 w-9 rounded-full bg-muted object-cover" />
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {(team.shortName ?? team.name).slice(0, 2).toUpperCase()}
    </div>
  )
}

export function MyTeamsView({
  teams,
  teamEventsById,
  showVenue,
  showTime
}: {
  teams: TrackedTeam[]
  teamEventsById: Record<string, SportTeamEvents>
  showVenue: boolean
  showTime: boolean
}): React.ReactElement {
  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No tracked teams yet. Add teams from Settings → Sports.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const events = teamEventsById[team.teamId]
        const lastGame = events?.last?.[0] ?? null
        const nextGame = events?.next?.[0] ?? null

        return (
          <GameCard
            key={team.teamId}
            header={
              <div className="flex items-center gap-3">
                <TeamBadge team={team} />
                <div>
                  <p className="text-sm font-semibold">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.leagueId}</p>
                </div>
              </div>
            }
            body={
              <div className="space-y-1.5">
                <p className="text-sm">
                  <span className="font-medium">Last:</span>{' '}
                  <span className="text-muted-foreground">
                    {lastGame ? getResultLine(lastGame, team.teamId) : 'No recent games'}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="font-medium">Next:</span>{' '}
                  <span className="text-muted-foreground">
                    {nextGame ? getNextLine(nextGame, team.teamId, showTime, showVenue) : 'No upcoming games scheduled'}
                  </span>
                </p>
              </div>
            }
          />
        )
      })}
    </div>
  )
}

export default MyTeamsView