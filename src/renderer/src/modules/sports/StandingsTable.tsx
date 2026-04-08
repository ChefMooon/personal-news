import React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import type { SportLeague, SportStandingRow, TrackedTeam } from '../../../../shared/ipc-types'
import { IPC } from '../../../../shared/ipc-types'
import { cn } from '../../lib/utils'
import { getCurrentSeason, getStandingFormTokens } from './page-utils'

function FormPill({ result }: { result: 'W' | 'L' | 'D' }): React.ReactElement {
  const classes = result === 'W'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200'
    : result === 'L'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-200'
      : 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200'

  return <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold', classes)}>{result}</span>
}

function getMetricLabel(sport: string): string {
  return sport === 'Ice Hockey' ? 'Pts' : 'Pct'
}

function getRecordExtraLabel(sport: string): string {
  return sport === 'Ice Hockey' ? 'OTL' : 'T'
}

function formatMetricValue(sport: string, value: number): string {
  if (sport === 'Ice Hockey') {
    return String(value)
  }

  return `${(Math.max(0, Math.round(value)) / 1000).toFixed(3)}`.replace(/^0/, '')
}

function formatCollapsedSummary(league: SportLeague, rows: SportStandingRow[], trackedTeamIds: Set<string>): string {
  if (rows.length === 0) {
    return 'No standings loaded.'
  }

  const leader = rows[0]
  const trackedCount = rows.filter((row) => trackedTeamIds.has(row.teamId)).length
  const leaderMetric = `${getMetricLabel(league.sport)} ${formatMetricValue(league.sport, leader.points)}`
  const trackedSuffix = trackedCount > 0 ? ` · ${trackedCount} tracked` : ''
  return `Leader: ${leader.teamName} (${leader.win}-${leader.loss}${leader.draw > 0 ? `-${leader.draw}` : ''}) · ${leaderMetric}${trackedSuffix}`
}

function StandingsCollapsedLoading(): React.ReactElement {
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="h-2 w-2 animate-pulse rounded-full bg-primary/70" />
      <div className="h-2 w-24 animate-pulse rounded-full bg-muted/70" />
      <div className="h-2 w-16 animate-pulse rounded-full bg-muted/50" />
      <div className="h-2 w-12 animate-pulse rounded-full bg-muted/35" />
    </div>
  )
}

function StandingsExpandedLoading(): React.ReactElement {
  return (
    <div className="mt-3 rounded-xl border bg-muted/15 p-3">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_36px_36px_36px_52px_84px] gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <div>#</div>
        <div>Team</div>
        <div>W</div>
        <div>L</div>
        <div>T</div>
        <div>Stat</div>
        <div>Form</div>
      </div>
      <div className="mt-2 space-y-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="grid grid-cols-[40px_minmax(0,1fr)_36px_36px_36px_52px_84px] items-center gap-2 rounded-lg border border-white/5 bg-background/40 px-2 py-2"
          >
            <div className="h-3 w-5 animate-pulse rounded bg-muted/60" />
            <div>
              <div className="h-3 w-28 animate-pulse rounded bg-muted/60" />
              <div className="mt-1 h-2 w-20 animate-pulse rounded bg-muted/35" />
            </div>
            <div className="h-3 w-6 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-6 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-6 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-10 animate-pulse rounded bg-muted/60" />
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((pill) => (
                <div key={pill} className="h-4 w-4 animate-pulse rounded-full bg-muted/50" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StandingsTable({
  league,
  trackedTeams,
  onRowsLoaded
}: {
  league: SportLeague
  trackedTeams: TrackedTeam[]
  onRowsLoaded?: (leagueId: string, rows: SportStandingRow[]) => void
}): React.ReactElement {
  const season = React.useMemo(() => getCurrentSeason(league.sport), [league.sport])
  const [rows, setRows] = React.useState<SportStandingRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [collapsed, setCollapsed] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    const run = async (): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const result = (await window.api.invoke(IPC.SPORTS_GET_STANDINGS, {
          leagueId: league.leagueId,
          season,
          sport: league.sport,
          leagueName: league.name
        })) as SportStandingRow[]

        if (!cancelled) {
          setRows(result)
          onRowsLoaded?.(league.leagueId, result)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load standings.')
          setRows([])
          onRowsLoaded?.(league.leagueId, [])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [league.leagueId, league.name, league.sport, onRowsLoaded, season])

  const trackedTeamIds = React.useMemo(() => new Set(trackedTeams.map((team) => team.teamId)), [trackedTeams])
  const trackedNames = React.useMemo(() => new Set(trackedTeams.map((team) => team.name.toLowerCase())), [trackedTeams])
  const collapsedSummary = React.useMemo(
    () => formatCollapsedSummary(league, rows, trackedTeamIds),
    [league, rows, trackedTeamIds]
  )

  return (
    <section className="rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold leading-none">{league.name}</h3>
            <Badge variant="outline">{season}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">League standings fetched live from upstream sports APIs.</p>
          {collapsed && loading ? <StandingsCollapsedLoading /> : null}
          {collapsed && !loading && !error ? (
            <p className="mt-2 truncate text-xs text-muted-foreground">{collapsedSummary}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {league.logoUrl ? <img src={league.logoUrl} alt="" className="h-8 w-8 rounded-lg border bg-muted object-cover" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setCollapsed((current) => !current)}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            {collapsed ? 'Show' : 'Hide'}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out',
          collapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-3 grid-rows-[1fr] opacity-100'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {loading ? (
            <StandingsExpandedLoading />
          ) : error ? (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">{error}</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">Standings unavailable.</div>
          ) : (
            <ScrollArea className="w-full">
              <table className="min-w-full text-xs">
                <thead className="text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 pr-2">Team</th>
                    <th className="pb-2 pr-2">W</th>
                    <th className="pb-2 pr-2">L</th>
                    <th className="pb-2 pr-2">{getRecordExtraLabel(league.sport)}</th>
                    <th className="pb-2 pr-2">{getMetricLabel(league.sport)}</th>
                    <th className="pb-2 pr-0">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tracked = trackedTeamIds.has(row.teamId) || trackedNames.has(row.teamName.toLowerCase())
                    const form = getStandingFormTokens(row.form)

                    return (
                      <tr key={row.teamId} className={cn('border-t', tracked && 'bg-primary/5')}>
                        <td className="py-2 pr-2 font-medium tabular-nums">{row.rank}</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium leading-none">{row.teamName}</span>
                            {tracked ? <Badge variant="outline" className="h-5 px-1.5 text-[9px]">Tracked</Badge> : null}
                          </div>
                          {row.description ? <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{row.description}</p> : null}
                        </td>
                        <td className="py-2 pr-2 tabular-nums">{row.win}</td>
                        <td className="py-2 pr-2 tabular-nums">{row.loss}</td>
                        <td className="py-2 pr-2 tabular-nums">{row.draw}</td>
                        <td className="py-2 pr-2 font-medium tabular-nums">{formatMetricValue(league.sport, row.points)}</td>
                        <td className="py-2 pr-0">
                          <div className="flex items-center gap-0.5">
                            {form.length > 0 ? form.slice(0, 5).map((result, index) => <FormPill key={`${row.teamId}-${index}`} result={result} />) : <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </div>
      </div>
    </section>
  )
}

export default StandingsTable