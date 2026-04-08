import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw, Settings2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { useSportsViewConfig } from '../../hooks/useSportsViewConfig'
import { IPC, type IpcMutationResult, type SportEvent, type SportLeague, type SportsDataUpdatedEvent, type SportTeamEvents, type TrackedTeam } from '../../../../shared/ipc-types'
import { ALL_SPORTS_ID, SUPPORTED_SPORTS, getSportLabel } from '../../../../shared/sports'
import { AllGamesView } from './AllGamesView'
import { getLeagueKey } from './league-display'
import { MyTeamsView } from './MyTeamsView'
import { SportsSettingsPanel } from './SportsSettingsPanel'

function dedupeEvents(events: SportEvent[]): SportEvent[] {
  const seen = new Set<string>()
  const result: SportEvent[] = []
  for (const event of events) {
    if (seen.has(event.eventId)) {
      continue
    }
    seen.add(event.eventId)
    result.push(event)
  }
  return result
}

function sortUpcomingEvents(a: SportEvent, b: SportEvent): number {
  const aValue = Date.parse(`${a.eventDate}T${a.eventTime ?? '12:00'}:00Z`)
  const bValue = Date.parse(`${b.eventDate}T${b.eventTime ?? '12:00'}:00Z`)
  return aValue - bValue
}

function SportsWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance()
  const widgetTitle = label ?? 'Sports'
  const { config, setConfig } = useSportsViewConfig(instanceId)
  const selectedSports = useMemo(
    () => (config.sport === ALL_SPORTS_ID ? SUPPORTED_SPORTS : [config.sport]),
    [config.sport]
  )
  const showSportLabels = config.sport === ALL_SPORTS_ID
  const sportLabel = getSportLabel(config.sport)
  const [todayEvents, setTodayEvents] = useState<SportEvent[]>([])
  const [trackedTeams, setTrackedTeams] = useState<TrackedTeam[]>([])
  const [leagues, setLeagues] = useState<SportLeague[]>([])
  const [teamEventsById, setTeamEventsById] = useState<Record<string, SportTeamEvents>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const hasLoadedDataRef = useRef(false)
  const latestLoadIdRef = useRef(0)

  const loadTeamEvents = useCallback(async (teams: TrackedTeam[]): Promise<Record<string, SportTeamEvents>> => {
    const pairs = await Promise.all(
      teams.map(async (team) => {
        const events = (await window.api.invoke(IPC.SPORTS_GET_TEAM_EVENTS, { teamId: team.teamId })) as SportTeamEvents
        return [team.teamId, events] as const
      })
    )

    return Object.fromEntries(pairs)
  }, [])

  const loadData = useCallback(async ({ preserveContent = false }: { preserveContent?: boolean } = {}) => {
    const loadId = latestLoadIdRef.current + 1
    latestLoadIdRef.current = loadId

    if (!preserveContent || !hasLoadedDataRef.current) {
      setLoading(true)
    }

    try {
      const [eventResults, leagueResults, allTeams] = await Promise.all([
        Promise.all(selectedSports.map((sport) => window.api.invoke(IPC.SPORTS_GET_TODAY_EVENTS, { sport }))),
        Promise.all(selectedSports.map((sport) => window.api.invoke(IPC.SPORTS_GET_LEAGUES, { sport }))),
        window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS)
      ])

      const selectedSportSet = new Set(selectedSports)
      const sportTeams = (allTeams as TrackedTeam[]).filter((team) => selectedSportSet.has(team.sport))
      const nextTeamEventsById = await loadTeamEvents(sportTeams)

      if (loadId !== latestLoadIdRef.current) {
        return
      }

      setTodayEvents((eventResults as SportEvent[][]).flat())
      setLeagues((leagueResults as SportLeague[][]).flat())
      setTrackedTeams(sportTeams)
      setTeamEventsById(nextTeamEventsById)
      hasLoadedDataRef.current = true
    } catch (err) {
      if (loadId !== latestLoadIdRef.current) {
        return
      }

      toast.error(err instanceof Error ? err.message : 'Failed to load Sports widget data.')
    } finally {
      if (loadId === latestLoadIdRef.current) {
        setLoading(false)
      }
    }
  }, [loadTeamEvents, selectedSports])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    return window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
      const payload = event as SportsDataUpdatedEvent
      if (!selectedSports.includes(payload.sport)) {
        return
      }

      if (!payload.ok && payload.error) {
        toast.error(payload.error)
      }

      void loadData({ preserveContent: true })
    })
  }, [loadData, selectedSports])

  const leaguesById = useMemo(
    () => Object.fromEntries(leagues.map((league) => [getLeagueKey(league.sport, league.leagueId), league] as const)),
    [leagues]
  )

  const enabledTeams = useMemo(
    () => trackedTeams.filter((team) => team.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [trackedTeams]
  )

  const fallbackEvents = useMemo(() => {
    const enabledLeagueIds = new Set(
      leagues.filter((league) => league.enabled).map((league) => getLeagueKey(league.sport, league.leagueId))
    )
    return dedupeEvents(
      enabledTeams.flatMap((team) => teamEventsById[team.teamId]?.next ?? [])
    )
      .filter((event) => enabledLeagueIds.size === 0 || enabledLeagueIds.has(getLeagueKey(event.sport, event.leagueId)))
      .sort(sortUpcomingEvents)
  }, [enabledTeams, leagues, teamEventsById])

  const refreshNow = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const results = (await Promise.all(
        selectedSports.map((sport) => window.api.invoke(IPC.SPORTS_REFRESH, { sport }))
      )) as IpcMutationResult[]
      const failed = results.find((result) => !result.ok)
      if (failed) {
        toast.error(failed.error ?? 'Failed to refresh Sports data.')
        return
      }
      toast.success('Sports data refresh started.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh Sports data.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{widgetTitle}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily schedule and tracked teams for {sportLabel}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => void refreshNow()} disabled={refreshing} aria-label="Refresh sports data">
              <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsEditing((current) => !current)} aria-label={isEditing ? 'Close sports settings panel' : 'Open sports settings panel'}>
              {isEditing ? <X className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isEditing ? (
          <div className="sports-card-edit">
            <div className="sports-card-edit__preview">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading sports data...</p>
              ) : config.viewMode === 'all_games' ? (
                <AllGamesView
                  events={todayEvents}
                  leaguesById={leaguesById}
                  showTime={config.showTime}
                  showVenue={config.showVenue}
                  fallbackEvents={fallbackEvents}
                  showSportLabels={showSportLabels}
                />
              ) : (
                <MyTeamsView
                  teams={enabledTeams}
                  teamEventsById={teamEventsById}
                  leaguesById={leaguesById}
                  showVenue={config.showVenue}
                  showTime={config.showTime}
                  viewMode={config.viewMode}
                  showSportLabels={showSportLabels}
                />
              )}
            </div>
            <div className="sports-card-edit__panel">
              <SportsSettingsPanel config={config} setConfig={setConfig} />
            </div>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading sports data...</p>
        ) : config.viewMode === 'all_games' ? (
          <AllGamesView
            events={todayEvents}
            leaguesById={leaguesById}
            showTime={config.showTime}
            showVenue={config.showVenue}
            fallbackEvents={fallbackEvents}
            showSportLabels={showSportLabels}
          />
        ) : (
          <MyTeamsView
            teams={enabledTeams}
            teamEventsById={teamEventsById}
            leaguesById={leaguesById}
            showVenue={config.showVenue}
            showTime={config.showTime}
            viewMode={config.viewMode}
            showSportLabels={showSportLabels}
          />
        )}
      </CardContent>
    </Card>
  )
}

export default SportsWidget