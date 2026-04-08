import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, RefreshCcw, Search, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import {
  IPC,
  type IpcMutationResult,
  type SportLeague,
  type SportsDataUpdatedEvent,
  type SportsSettings,
  type SportSyncStatus,
  type TeamSearchResult,
  type TrackedTeam
} from '../../../../shared/ipc-types'
import { DEFAULT_SPORT, SPORTS_OPTIONS, getSportLabel, type SupportedSport } from '../../../../shared/sports'

function formatLastSynced(timestamp: number | null): string {
  if (timestamp == null) {
    return 'Never'
  }

  const date = new Date(timestamp * 1000)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = date.toDateString() === today.toDateString()
  const isYesterday = date.toDateString() === yesterday.toDateString()

  if (sameDay) {
    return `Today at ${timeLabel}`
  }
  if (isYesterday) {
    return `Yesterday at ${timeLabel}`
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function SportsSettingsTab(): React.ReactElement {
  const [selectedSport, setSelectedSport] = useState<SupportedSport>(DEFAULT_SPORT)
  const [status, setStatus] = useState<SportSyncStatus | null>(null)
  const [teams, setTeams] = useState<TrackedTeam[]>([])
  const [leagues, setLeagues] = useState<SportLeague[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<TeamSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [sportsSettings, setSportsSettings] = useState<SportsSettings>({ pollIntervalMinutes: 5 })
  const [pollIntervalValue, setPollIntervalValue] = useState('5')
  const [savingPollInterval, setSavingPollInterval] = useState(false)
  const [browseLeaguesOpen, setBrowseLeaguesOpen] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [statusList, trackedTeams, sportLeagues, currentSettings] = await Promise.all([
        window.api.invoke(IPC.SPORTS_GET_STATUS),
        window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS),
        window.api.invoke(IPC.SPORTS_GET_LEAGUES, { sport: selectedSport }),
        window.api.invoke(IPC.SETTINGS_GET_SPORTS_SETTINGS)
      ])

      setStatus(((statusList as SportSyncStatus[]).find((item) => item.sport === selectedSport) ?? null))
      setTeams((trackedTeams as TrackedTeam[]).filter((team) => team.sport === selectedSport).sort((a, b) => a.sortOrder - b.sortOrder))
      setLeagues((sportLeagues as SportLeague[]).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name)))
      setSportsSettings(currentSettings as SportsSettings)
      setPollIntervalValue(String((currentSettings as SportsSettings).pollIntervalMinutes))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load Sports settings.')
    }
  }, [selectedSport])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    return window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
      const payload = event as SportsDataUpdatedEvent
      if (payload.sport !== selectedSport) {
        return
      }
      if (!payload.ok && payload.error) {
        toast.error(payload.error)
      }
      void loadData()
    })
  }, [loadData, selectedSport])

  useEffect(() => {
    setSearchResults([])
  }, [selectedSport])

  const trackedTeamIds = useMemo(() => new Set(teams.map((team) => team.teamId)), [teams])
  const sportLabel = getSportLabel(selectedSport)

  const refreshNow = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = (await window.api.invoke(IPC.SPORTS_REFRESH, { sport: selectedSport })) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to refresh sports data.')
        return
      }
      toast.success('Sports refresh complete.')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh sports data.')
    } finally {
      setRefreshing(false)
    }
  }

  const savePollInterval = async (): Promise<void> => {
    const parsed = Number.parseInt(pollIntervalValue, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
      toast.error('Refresh interval must be between 1 and 1440 minutes.')
      return
    }

    setSavingPollInterval(true)
    try {
      const nextSettings = (await window.api.invoke(IPC.SETTINGS_UPDATE_SPORTS_SETTINGS, {
        pollIntervalMinutes: parsed
      })) as SportsSettings
      setSportsSettings(nextSettings)
      setPollIntervalValue(String(nextSettings.pollIntervalMinutes))
      toast.success('Sports refresh interval saved.')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save sports refresh interval.')
    } finally {
      setSavingPollInterval(false)
    }
  }

  const runSearch = async (): Promise<void> => {
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      return
    }

    setSearching(true)
    try {
      const results = (await window.api.invoke(IPC.SPORTS_SEARCH_TEAMS, {
        query: trimmed,
        sport: selectedSport
      })) as TeamSearchResult[]
      setSearchResults(results)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to search sports teams.')
    } finally {
      setSearching(false)
    }
  }

  const addTeam = async (result: TeamSearchResult): Promise<void> => {
    if (trackedTeamIds.has(result.teamId)) {
      toast.info('That team is already tracked.')
      return
    }

    try {
      await window.api.invoke(IPC.SPORTS_ADD_TEAM, {
        teamId: result.teamId,
        leagueId: result.leagueId,
        sport: result.sport,
        teamName: result.name,
        leagueName: result.leagueName,
        badgeUrl: result.badgeUrl
      })
      toast.success(`Added ${result.name}.`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add team.')
    }
  }

  const toggleTeamEnabled = async (team: TrackedTeam, enabled: boolean): Promise<void> => {
    try {
      const result = (await window.api.invoke(IPC.SPORTS_SET_TEAM_ENABLED, {
        teamId: team.teamId,
        enabled
      })) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update team visibility.')
        return
      }
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update team visibility.')
    }
  }

  const removeTeam = async (teamId: string): Promise<void> => {
    try {
      const result = (await window.api.invoke(IPC.SPORTS_REMOVE_TEAM, { teamId })) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to remove team.')
        return
      }
      toast.success('Team removed.')
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove team.')
    }
  }

  const reorderTeams = async (fromIndex: number, toIndex: number): Promise<void> => {
    if (toIndex < 0 || toIndex >= teams.length) {
      return
    }

    const next = [...teams]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)

    try {
      const result = (await window.api.invoke(IPC.SPORTS_SET_TEAM_ORDER, {
        orderedIds: next.map((team) => team.teamId)
      })) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to reorder teams.')
        return
      }
      setTeams(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reorder teams.')
    }
  }

  const setLeagueEnabled = async (league: SportLeague, enabled: boolean): Promise<void> => {
    try {
      const result = enabled
        ? await window.api.invoke(IPC.SPORTS_ADD_LEAGUE, { leagueId: league.leagueId, sport: league.sport })
        : await window.api.invoke(IPC.SPORTS_REMOVE_LEAGUE, { leagueId: league.leagueId })

      if (!enabled) {
        const mutation = result as IpcMutationResult
        if (!mutation.ok) {
          toast.error(mutation.error ?? 'Failed to update league visibility.')
          return
        }
      }

      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update league visibility.')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl pb-8">
      <Dialog open={browseLeaguesOpen} onOpenChange={setBrowseLeaguesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Browse {sportLabel} Leagues</DialogTitle>
            <DialogDescription>
              Enable leagues to include them in the All Games view.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {leagues.map((league) => (
              <div key={league.leagueId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{league.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{league.country ?? league.leagueId}</p>
                </div>
                <Button variant={league.enabled ? 'secondary' : 'outline'} size="sm" onClick={() => void setLeagueEnabled(league, !league.enabled)}>
                  {league.enabled ? 'Enabled' : 'Enable'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <h3 className="mb-1 text-sm font-medium">Sport</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Choose which sport to configure for shared cache, tracked teams, and league coverage.
        </p>
        <div className="max-w-xs">
          <Select value={selectedSport} onValueChange={(value) => setSelectedSport(value as SupportedSport)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent align="start" side="bottom">
              {SPORTS_OPTIONS.map((sport) => (
                <SelectItem key={sport.id} value={sport.id}>{sport.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">Data & Refresh</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Shared sports cache state for all Sports widgets.
        </p>
        <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
          <div className="rounded-md border px-3 py-3">
            <p className="text-sm font-medium">{sportLabel}</p>
            <p className="mt-2 text-xs text-muted-foreground">Last synced: {formatLastSynced(status?.lastFetchedAt ?? null)}</p>
            <p className="text-xs text-muted-foreground">Enabled leagues: {status?.enabledLeagueCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Tracked teams: {status?.trackedTeamCount ?? 0}</p>
          </div>
          <div className="rounded-md border px-3 py-3">
            <p className="text-sm font-medium">Refresh cadence</p>
            <p className="mt-2 text-xs text-muted-foreground">Refresh every ___ minutes for automatic sports sync.</p>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={pollIntervalValue}
                onChange={(event) => setPollIntervalValue(event.target.value)}
                inputMode="numeric"
                className="w-28"
                aria-label="Sports refresh interval in minutes"
              />
              <Button variant="outline" size="sm" onClick={() => void savePollInterval()} disabled={savingPollInterval}>
                {savingPollInterval ? 'Saving...' : 'Save Interval'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Current setting: every {sportsSettings.pollIntervalMinutes} minute{sportsSettings.pollIntervalMinutes === 1 ? '' : 's'}.</p>
            <Button className="mt-3" variant="outline" size="sm" onClick={() => void refreshNow()} disabled={refreshing}>
              <RefreshCcw className={`mr-1 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh Now'}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">{sportLabel} Tracked Teams</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Teams render in the order shown here when the widget is set to My Teams.
        </p>
        <div className="rounded-md border px-3 py-3 max-w-3xl">
          <div className="flex gap-2">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search team name" />
            <Button variant="outline" size="sm" onClick={() => void runSearch()} disabled={searching}>
              <Search className="mr-1 h-4 w-4" />
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {searchResults.length > 0 ? (
            <div className="mt-3 space-y-2">
              {searchResults.map((result) => (
                <div key={result.teamId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{result.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{result.leagueName}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void addTeam(result)} disabled={trackedTeamIds.has(result.teamId)}>
                    <Plus className="mr-1 h-4 w-4" />
                    {trackedTeamIds.has(result.teamId) ? 'Already added' : 'Add'}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {teams.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No tracked teams yet.
              </div>
            ) : (
              teams.map((team, index) => (
                <div key={team.teamId} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{team.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{team.leagueId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => void reorderTeams(index, index - 1)} disabled={index === 0} aria-label="Move team up">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => void reorderTeams(index, index + 1)} disabled={index === teams.length - 1} aria-label="Move team down">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Switch checked={team.enabled} onCheckedChange={(checked) => void toggleTeamEnabled(team, checked)} aria-label={`Enable ${team.name}`} />
                    <Button variant="outline" size="icon" onClick={() => void removeTeam(team.teamId)} aria-label={`Remove ${team.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-medium">{sportLabel} Leagues in All Games View</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Enabled leagues appear in the All Games overview for {sportLabel}.
        </p>
        <div className="rounded-md border px-3 py-3 max-w-3xl space-y-3">
          <div className="space-y-2">
            {leagues.slice(0, 8).map((league) => (
              <div key={league.leagueId} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{league.name}</p>
                  <p className="text-xs text-muted-foreground">{league.country ?? league.leagueId}</p>
                </div>
                <Switch checked={league.enabled} onCheckedChange={(checked) => void setLeagueEnabled(league, checked)} aria-label={`Enable ${league.name}`} />
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setBrowseLeaguesOpen(true)}>
            Browse Leagues
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SportsSettingsTab