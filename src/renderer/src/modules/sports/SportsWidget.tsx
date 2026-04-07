import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RefreshCcw, Settings2, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { useSportsViewConfig } from '../../hooks/useSportsViewConfig'
import { IPC, type IpcMutationResult, type SportEvent, type SportLeague, type SportsDataUpdatedEvent, type SportTeamEvents, type TrackedTeam } from '../../../../shared/ipc-types'
import { AllGamesView } from './AllGamesView'
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
  const [todayEvents, setTodayEvents] = useState<SportEvent[]>([])
  const [trackedTeams, setTrackedTeams] = useState<TrackedTeam[]>([])
  const [leagues, setLeagues] = useState<SportLeague[]>([])
  const [teamEventsById, setTeamEventsById] = useState<Record<string, SportTeamEvents>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const loadTeamEvents = useCallback(async (teams: TrackedTeam[]): Promise<Record<string, SportTeamEvents>> => {
    const pairs = await Promise.all(
      teams.map(async (team) => {
        const events = (await window.api.invoke(IPC.SPORTS_GET_TEAM_EVENTS, { teamId: team.teamId })) as SportTeamEvents
        return [team.teamId, events] as const
      })
    )

    return Object.fromEntries(pairs)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [events, leaguesResult, allTeams] = await Promise.all([
        window.api.invoke(IPC.SPORTS_GET_TODAY_EVENTS, { sport: config.sport }),
        window.api.invoke(IPC.SPORTS_GET_LEAGUES, { sport: config.sport }),
        window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS)
      ])

      const sportTeams = (allTeams as TrackedTeam[]).filter((team) => team.sport === config.sport)
      setTodayEvents(events as SportEvent[])
      setLeagues(leaguesResult as SportLeague[])
      setTrackedTeams(sportTeams)
      setTeamEventsById(await loadTeamEvents(sportTeams))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Sports widget data.')
    } finally {
      setLoading(false)
    }
  }, [config.sport, loadTeamEvents])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    return window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
      const payload = event as SportsDataUpdatedEvent
      if (payload.sport !== config.sport) {
        return
      }

      if (!payload.ok && payload.error) {
        toast.error(payload.error)
      }

      void loadData()
    })
  }, [config.sport, loadData])

  const leaguesById = useMemo(
    () => Object.fromEntries(leagues.map((league) => [league.leagueId, league] as const)),
    [leagues]
  )

  const enabledTeams = useMemo(
    () => trackedTeams.filter((team) => team.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    [trackedTeams]
  )

  const fallbackEvents = useMemo(() => {
    const enabledLeagueIds = new Set(leagues.filter((league) => league.enabled).map((league) => league.leagueId))
    return dedupeEvents(
      enabledTeams.flatMap((team) => teamEventsById[team.teamId]?.next ?? [])
    )
      .filter((event) => enabledLeagueIds.size === 0 || enabledLeagueIds.has(event.leagueId))
      .sort(sortUpcomingEvents)
  }, [enabledTeams, leagues, teamEventsById])

  const refreshNow = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = (await window.api.invoke(IPC.SPORTS_REFRESH, { sport: config.sport })) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to refresh Sports data.')
        return
      }
      toast.success('Sports data refresh started.')
      await loadData()
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
              Daily schedule and tracked teams for {config.sport}.
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
                />
              ) : (
                <MyTeamsView
                  teams={enabledTeams}
                  teamEventsById={teamEventsById}
                  showVenue={config.showVenue}
                  showTime={config.showTime}
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
          />
        ) : (
          <MyTeamsView
            teams={enabledTeams}
            teamEventsById={teamEventsById}
            showVenue={config.showVenue}
            showTime={config.showTime}
          />
        )}
      </CardContent>
    </Card>
  )
}

export default SportsWidget