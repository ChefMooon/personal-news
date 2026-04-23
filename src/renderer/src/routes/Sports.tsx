import React from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCcw, Settings, ShieldAlert, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import { useSportsEnabled } from '../contexts/SportsEnabledContext'
import { ExpandedGameCard } from '../modules/sports/ExpandedGameCard'
import { filterEventsForLocalDate, getClosestScheduledEventToNow } from '../modules/sports/page-utils'
import { SPORTS_PAGE_SPORT_ORDER_KEY, normalizeSportOrder } from '../modules/sports/sport-order'
import { StandingsTable } from '../modules/sports/StandingsTable'
import { TeamStatCard } from '../modules/sports/TeamStatCard'
import { TodayGamesStrip } from '../modules/sports/TodayGamesStrip'
import { getLeagueKey } from '../modules/sports/league-display'
import { IPC, type IpcMutationResult, type SportEvent, type SportLeague, type SportStandingRow, type SportTeamEvents, type SportsDataUpdatedEvent, type SportsDataFetchWarningEvent, type TrackedTeam } from '../../../shared/ipc-types'
import { SUPPORTED_SPORTS, getSportLabel, type SupportedSport } from '../../../shared/sports'

export default function SportsPage(): React.ReactElement {
  const navigate = useNavigate()
  const { enabled: sportsEnabled } = useSportsEnabled()
  const [sportOrder, setSportOrder] = React.useState<SupportedSport[]>(SUPPORTED_SPORTS)
  const [todayEvents, setTodayEvents] = React.useState<SportEvent[]>([])
  const [trackedTeams, setTrackedTeams] = React.useState<TrackedTeam[]>([])
  const [leagues, setLeagues] = React.useState<SportLeague[]>([])
  const [teamEventsById, setTeamEventsById] = React.useState<Record<string, SportTeamEvents>>({})
  const [standingsByLeague, setStandingsByLeague] = React.useState<Record<string, SportStandingRow[]>>({})
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [updating, setUpdating] = React.useState(false)
  const [todayGamesCollapsed, setTodayGamesCollapsed] = React.useState(false)
  const [selectedEvent, setSelectedEvent] = React.useState<SportEvent | null>(null)
  const [orderReady, setOrderReady] = React.useState(false)
  const hasLoadedDataRef = React.useRef(false)
  const latestLoadIdRef = React.useRef(0)

  React.useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, SPORTS_PAGE_SPORT_ORDER_KEY)
      .then((value) => {
        setSportOrder(normalizeSportOrder(value))
        setOrderReady(true)
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load sports page order.')
        setOrderReady(true)
      })
  }, [])

  React.useEffect(() => {
    if (!orderReady) {
      return
    }

    window.api.invoke(IPC.SETTINGS_SET, SPORTS_PAGE_SPORT_ORDER_KEY, JSON.stringify(sportOrder)).catch((error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save sports page order.')
    })
  }, [orderReady, sportOrder])

  const loadTeamEvents = React.useCallback(async (teams: TrackedTeam[]): Promise<Record<string, SportTeamEvents>> => {
    const pairs = await Promise.all(
      teams.map(async (team) => {
        const events = (await window.api.invoke(IPC.SPORTS_GET_TEAM_EVENTS, { teamId: team.teamId })) as SportTeamEvents
        return [team.teamId, events] as const
      })
    )

    return Object.fromEntries(pairs)
  }, [])

  const loadData = React.useCallback(async ({ preserveContent = false }: { preserveContent?: boolean } = {}) => {
    const loadId = latestLoadIdRef.current + 1
    latestLoadIdRef.current = loadId
    const shouldShowUpdating = preserveContent && hasLoadedDataRef.current

    if (!preserveContent || !hasLoadedDataRef.current) {
      setLoading(true)
    }
    if (shouldShowUpdating) {
      setUpdating(true)
    }

    try {
      const [eventResults, leagueResults, allTeams] = await Promise.all([
        Promise.all(SUPPORTED_SPORTS.map((sport) => window.api.invoke(IPC.SPORTS_GET_TODAY_EVENTS, { sport }))),
        Promise.all(SUPPORTED_SPORTS.map((sport) => window.api.invoke(IPC.SPORTS_GET_LEAGUES, { sport }))),
        window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS)
      ])

      const nextTodayEvents = (eventResults as SportEvent[][]).flat()
      const nextLeagues = (leagueResults as SportLeague[][]).flat()
      const teams = (allTeams as TrackedTeam[]).filter((team) => team.enabled)
      const nextTeamEventsById = await loadTeamEvents(teams)

      if (loadId !== latestLoadIdRef.current) {
        return
      }

      setTodayEvents(nextTodayEvents)
      setLeagues(nextLeagues)
      setTrackedTeams(teams)
      if (!preserveContent || !hasLoadedDataRef.current) {
        setStandingsByLeague({})
      }
      setTeamEventsById(nextTeamEventsById)
      hasLoadedDataRef.current = true
    } catch (error) {
      if (loadId !== latestLoadIdRef.current) {
        return
      }

      toast.error(error instanceof Error ? error.message : 'Failed to load Sports page data.')
    } finally {
      if (loadId === latestLoadIdRef.current) {
        setLoading(false)
        if (shouldShowUpdating) {
          setUpdating(false)
        }
      }
    }
  }, [loadTeamEvents])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  React.useEffect(() => {
    return window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
      const payload = event as SportsDataUpdatedEvent
      if (!payload.ok && payload.error) {
        toast.error(payload.error)
      }
      void loadData({ preserveContent: true })
    })
  }, [loadData])

  React.useEffect(() => {
    return window.api.on(IPC.SPORTS_FETCH_WARNING, (event) => {
      const payload = event as SportsDataFetchWarningEvent
      toast.warning(payload.message, {
        duration: 5000 // Auto-dismiss after 5 seconds
      })
    })
  }, [])

  const refreshAll = async (): Promise<void> => {
    setRefreshing(true)
    setUpdating(true)
    try {
      const results = (await Promise.all(
        SUPPORTED_SPORTS.map((sport) => window.api.invoke(IPC.SPORTS_REFRESH, { sport }))
      )) as IpcMutationResult[]

      const failed = results.find((result) => !result.ok)
      if (failed) {
        setUpdating(false)
        toast.error(failed.error ?? 'Failed to refresh sports data.')
        return
      }

      toast.success('Sports refresh complete.')
    } catch (error) {
      setUpdating(false)
      toast.error(error instanceof Error ? error.message : 'Failed to refresh sports data.')
    } finally {
      setRefreshing(false)
    }
  }

  const enabledLeaguesBySport = React.useMemo(() => {
    const map = new Map<string, SportLeague[]>()
    for (const sport of sportOrder) {
      map.set(sport, leagues.filter((league) => league.sport === sport && league.enabled))
    }
    return map
  }, [leagues, sportOrder])

  const leaguesById = React.useMemo(
    () => Object.fromEntries(leagues.map((league) => [getLeagueKey(league.sport, league.leagueId), league] as const)),
    [leagues]
  )

  const trackedTeamsBySport = React.useMemo(() => {
    const map = new Map<string, TrackedTeam[]>()
    for (const sport of sportOrder) {
      map.set(
        sport,
        trackedTeams
          .filter((team) => team.sport === sport)
          .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name))
      )
    }
    return map
  }, [sportOrder, trackedTeams])

  const visibleTodayEvents = React.useMemo(() => filterEventsForLocalDate(todayEvents), [todayEvents])
  const autoScrollEvent = React.useMemo(() => getClosestScheduledEventToNow(visibleTodayEvents), [visibleTodayEvents])

  React.useEffect(() => {
    setSelectedEvent((current) => {
      if (!current) {
        return null
      }

      return visibleTodayEvents.find((event) => event.eventId === current.eventId) ?? null
    })
  }, [visibleTodayEvents])

  const getStandingForTeam = React.useCallback((team: TrackedTeam): SportStandingRow | null => {
    const rows = standingsByLeague[team.leagueId] ?? []
    return rows.find((row) => row.teamId === team.teamId || row.teamName.toLowerCase() === team.name.toLowerCase()) ?? null
  }, [standingsByLeague])

  const handleStandingsRowsLoaded = React.useCallback((leagueId: string, rows: SportStandingRow[]): void => {
    setStandingsByLeague((current) => {
      if (current[leagueId] === rows) {
        return current
      }

      return { ...current, [leagueId]: rows }
    })
  }, [])

  if (!sportsEnabled) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        <div className="max-w-lg rounded-2xl border bg-card p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Sports is disabled</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enable the Sports feature from Settings to access the full sports page and live radio player.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Trophy className="h-5 w-5" />
                <span className="text-sm font-medium">Sports</span>
                <span
                  className={`inline-flex min-w-[84px] items-center gap-1.5 text-xs transition-opacity ${updating ? 'opacity-100' : 'opacity-0'}`}
                  aria-live="polite"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Updating
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold">Season context and today&apos;s action</h1>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Track live games, league tables, team momentum, and best-effort radio coverage from one dedicated sports view.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void refreshAll()} disabled={refreshing}>
                <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => navigate('/settings?tab=sports')}
                aria-label="Open Sports settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TodayGamesStrip
            events={visibleTodayEvents}
            collapsed={todayGamesCollapsed}
            onCollapsedChange={setTodayGamesCollapsed}
            autoScrollEventId={autoScrollEvent?.eventId ?? null}
            selectedEventId={selectedEvent?.eventId ?? null}
            onSelect={(event) => {
              setSelectedEvent((current) => {
                return current?.eventId === event.eventId ? null : event
              })
            }}
          />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {selectedEvent ? (
          <div className="mb-6">
            <ExpandedGameCard key={selectedEvent.eventId} event={selectedEvent} />
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            <div className="h-36 animate-pulse rounded-2xl bg-muted/30" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted/30" />
          </div>
        ) : (
          <div className="space-y-10">
            {sportOrder.map((sport) => {
              const sportTeams = trackedTeamsBySport.get(sport) ?? []
              const sportLeagues = enabledLeaguesBySport.get(sport) ?? []

              if (sportTeams.length === 0 && sportLeagues.length === 0 && !visibleTodayEvents.some((event) => event.sport === sport)) {
                return null
              }

              return (
                <section key={sport} className="space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold">{getSportLabel(sport)}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {sportTeams.length} tracked teams · {sportLeagues.length} enabled leagues
                      </p>
                    </div>
                  </div>

                  {sportTeams.length > 0 ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                      {sportTeams.map((team) => (
                        <TeamStatCard
                          key={team.teamId}
                          team={team}
                          events={teamEventsById[team.teamId]}
                          standing={getStandingForTeam(team)}
                          leaguesById={leaguesById}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                      No tracked teams yet for {getSportLabel(sport)}.
                    </div>
                  )}

                  <Separator />

                  {sportLeagues.length > 0 ? (
                    <div className="grid gap-4 2xl:grid-cols-2">
                      {sportLeagues.map((league) => (
                        <StandingsTable
                          key={league.leagueId}
                          league={league}
                          trackedTeams={sportTeams}
                          onRowsLoaded={handleStandingsRowsLoaded}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
                      No leagues are enabled for {getSportLabel(sport)}.
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}