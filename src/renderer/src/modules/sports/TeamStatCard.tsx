import React from 'react'
import { Badge } from '../../components/ui/badge'
import type { SportEvent, SportLeague, SportStandingRow, SportTeamEvents, TrackedTeam } from '../../../../shared/ipc-types'
import { cn } from '../../lib/utils'
import { getLeagueLabel } from './league-display'
import { TeamAvatar } from './TeamAvatar'
import {
  formatEventDateTime,
  getRecentOutcomes,
  getRecordLabel,
  getStreakLabel,
  type TeamOutcome
} from './page-utils'
import { getGamePhase } from './utils'

function OutcomeDot({ outcome }: { outcome: TeamOutcome }): React.ReactElement {
  const classes = outcome === 'W'
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
    : outcome === 'L'
      ? 'bg-red-500/15 text-red-700 dark:text-red-200'
      : 'bg-slate-500/15 text-slate-700 dark:text-slate-200'

  return <span className={cn('inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold', classes)}>{outcome}</span>
}

function getNextGame(events: SportEvent[]): SportEvent | null {
  return [...events]
    .filter((event) => getGamePhase(event) === 'scheduled')
    .sort((left, right) => Date.parse(`${left.eventDate}T${left.eventTime ?? '12:00'}:00Z`) - Date.parse(`${right.eventDate}T${right.eventTime ?? '12:00'}:00Z`))[0] ?? null
}

function getOpponentName(event: SportEvent, teamId: string): string {
  return event.homeTeamId === teamId ? event.awayTeam : event.homeTeam
}

function getStandingMetric(
  sport: string,
  standing: SportStandingRow | null
): { label: string; value: string } | null {
  if (!standing) {
    return null
  }

  if (sport === 'Ice Hockey') {
    return {
      label: 'Points',
      value: String(standing.points)
    }
  }

  return {
    label: 'Win %',
    value: `${(Math.max(0, standing.points) / 1000).toFixed(3)}`.replace(/^0/, '')
  }
}

function getDifferentialLabel(sport: string): string {
  if (sport === 'Baseball') {
    return 'Run diff'
  }

  if (sport === 'Basketball') {
    return 'Point diff'
  }

  return 'Goal diff'
}

function formatSignedValue(value: number): string {
  if (value > 0) {
    return `+${value}`
  }

  return String(value)
}

export function TeamStatCard({
  team,
  events,
  standing,
  leaguesById
}: {
  team: TrackedTeam
  events: SportTeamEvents | undefined
  standing: SportStandingRow | null
  leaguesById: Record<string, SportLeague>
}): React.ReactElement {
  const recentOutcomes = React.useMemo(() => getRecentOutcomes(events?.last ?? [], team.teamId), [events?.last, team.teamId])
  const streak = React.useMemo(() => getStreakLabel(recentOutcomes), [recentOutcomes])
  const nextGame = React.useMemo(() => getNextGame(events?.next ?? []), [events?.next])
  const record = getRecordLabel(standing, recentOutcomes)
  const standingMetric = React.useMemo(() => getStandingMetric(team.sport, standing), [standing, team.sport])
  const differentialLabel = React.useMemo(() => getDifferentialLabel(team.sport), [team.sport])

  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <TeamAvatar
          name={team.shortName ?? team.name}
          src={team.badgeUrl}
          className="h-12 w-12 rounded-xl"
          fallbackClassName="text-sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="truncate text-base font-semibold">{team.name}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {team.sport} · {getLeagueLabel({ sport: team.sport, leagueId: team.leagueId, leaguesById })}
              </p>
            </div>
            {standing ? <Badge variant="outline">#{standing.rank}</Badge> : null}
          </div>

          <div className="mt-4 rounded-xl border bg-muted/20 px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Next matchup</p>
            {nextGame ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{getOpponentName(nextGame, team.teamId)}</p>
                <p className="text-xs text-muted-foreground">{formatEventDateTime(nextGame)}</p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No upcoming games scheduled</p>
            )}
          </div>

          <div className={cn('mt-4 grid gap-3', standingMetric ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2')}>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Record</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{record}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Streak</p>
              <p className="mt-1 text-lg font-semibold">{streak ?? '—'}</p>
            </div>
            {standingMetric ? (
              <div className="rounded-xl border bg-muted/20 px-3 py-2 col-span-2 md:col-span-1">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{standingMetric.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{standingMetric.value}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Last 5</p>
          <div className="mt-2 flex items-center gap-2">
            {recentOutcomes.length > 0 ? recentOutcomes.map((outcome, index) => <OutcomeDot key={`${team.teamId}-${index}`} outcome={outcome} />) : <span className="text-sm text-muted-foreground">No recent results</span>}
          </div>
        </div>

        {standing ? (
          <div className="text-right text-xs text-muted-foreground">
            <p>Played: <span className="font-medium text-foreground">{standing.played}</span></p>
            {standing.goalDifference != null ? (
              <p>
                {differentialLabel}: <span className="font-medium text-foreground">{formatSignedValue(standing.goalDifference)}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

export default TeamStatCard