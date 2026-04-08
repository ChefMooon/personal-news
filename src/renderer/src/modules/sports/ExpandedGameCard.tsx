import React from 'react'
import { LoaderCircle, Radio, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import type { SportEvent, SportEventDetail } from '../../../../shared/ipc-types'
import { IPC } from '../../../../shared/ipc-types'
import { formatRadioGameLabel, useRadioPlayer } from '../../contexts/RadioPlayerContext'
import { formatEventDateTime } from './page-utils'
import { TeamAvatar } from './TeamAvatar'
import { isLiveStatus } from './utils'

function mergeDetailWithEvent(detail: SportEventDetail, event: SportEvent): SportEventDetail {
  return {
    ...detail,
    homeTeamBadgeUrl: detail.homeTeamBadgeUrl ?? event.homeTeamBadgeUrl ?? null,
    awayTeamBadgeUrl: detail.awayTeamBadgeUrl ?? event.awayTeamBadgeUrl ?? null
  }
}

function StationResults({ event }: { event: SportEvent }): React.ReactElement {
  const { searchGameKey, searchError, stationsLoading, stations, playStation, dismissSearchResults } = useRadioPlayer()

  if (searchGameKey !== event.eventId) {
    return <></>
  }

  if (stationsLoading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Searching Radio Browser for likely game coverage...
      </div>
    )
  }

  if (searchError) {
    return (
      <div className="mt-4 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
        <div className="flex items-start justify-between gap-3">
          <p>{searchError}</p>
          <Button type="button" size="icon" variant="ghost" className="-mr-1 h-7 w-7 shrink-0" onClick={dismissSearchResults} aria-label="Close radio station results">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  if (stations.length === 0) {
    return <></>
  }

  return (
    <div className="mt-4 rounded-2xl border bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Radio stations</p>
          <p className="text-xs text-muted-foreground">Only stations that exposed a playable stream during search are shown.</p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline">{stations.length}</Badge>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={dismissSearchResults} aria-label="Close radio station results">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {stations.map((station) => (
          <button
            key={station.stationuuid}
            type="button"
            onClick={() => void playStation(station, formatRadioGameLabel(event))}
            className="flex w-full items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/40"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{station.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[station.country, station.codec?.toUpperCase(), station.bitrate ? `${station.bitrate} kbps` : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ExpandedGameCard({ event }: { event: SportEvent }): React.ReactElement {
  const [detail, setDetail] = React.useState<SportEventDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const { searchStations } = useRadioPlayer()
  const latestRequestIdRef = React.useRef(0)

  const loadDetails = React.useCallback(async () => {
    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId
    setLoading(true)
    setError(null)
    setDetail(null)

    try {
      const result = (await window.api.invoke(IPC.SPORTS_GET_EVENT_DETAILS, { eventId: event.eventId })) as SportEventDetail | null
      if (requestId !== latestRequestIdRef.current) {
        return
      }

      setDetail(result ? mergeDetailWithEvent(result, event) : null)
    } catch (loadError) {
      if (requestId !== latestRequestIdRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Failed to load game details.')
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [event])

  React.useEffect(() => {
    void loadDetails()
  }, [loadDetails])

  const live = isLiveStatus(detail?.status ?? event.status)
  const resolvedDetail = detail ?? event

  return (
    <section className="rounded-2xl border bg-card px-5 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={live ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' : ''}>
              {live ? 'Live details' : 'Game details'}
            </Badge>
            <span className="text-xs text-muted-foreground">{resolvedDetail.sport}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <TeamAvatar name={resolvedDetail.awayTeam} src={resolvedDetail.awayTeamBadgeUrl} className="h-10 w-10 rounded-full" fallbackClassName="text-sm" />
              <span className="text-xl font-semibold">{resolvedDetail.awayTeam}</span>
            </div>
            <span className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">vs</span>
            <div className="flex items-center gap-2">
              <TeamAvatar name={resolvedDetail.homeTeam} src={resolvedDetail.homeTeamBadgeUrl} className="h-10 w-10 rounded-full" fallbackClassName="text-sm" />
              <span className="text-xl font-semibold">{resolvedDetail.homeTeam}</span>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{formatEventDateTime(resolvedDetail)}{resolvedDetail.venue ? ` · ${resolvedDetail.venue}` : ''}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadDetails()}>
            <RefreshCw className="h-4 w-4" />
            Refresh details
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void searchStations(event).catch((searchError) => {
                toast.error(searchError instanceof Error ? searchError.message : 'Failed to search radio stations.')
              })
            }}
          >
            <Radio className="h-4 w-4" />
            Find Radio
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <div className="h-28 animate-pulse rounded-2xl bg-muted/40" />
          <div className="h-28 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-dashed px-4 py-4 text-sm text-muted-foreground">
          {error}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="rounded-2xl border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Score</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{resolvedDetail.awayScore ?? '—'} - {resolvedDetail.homeScore ?? '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{resolvedDetail.status ?? 'Status unavailable'}</p>
                {detail?.progress ? <p className="mt-1 text-xs text-muted-foreground">{detail.progress}</p> : null}
              </div>
            </div>
            {detail?.descriptionEN ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{detail.descriptionEN}</p> : null}
          </div>

          <div className="rounded-2xl border bg-background p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">At a glance</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Away</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <TeamAvatar name={resolvedDetail.awayTeam} src={resolvedDetail.awayTeamBadgeUrl} className="h-8 w-8 rounded-full" fallbackClassName="text-[10px]" />
                  <span>{resolvedDetail.awayTeam}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Home</dt>
                <dd className="flex items-center gap-2 font-medium">
                  <TeamAvatar name={resolvedDetail.homeTeam} src={resolvedDetail.homeTeamBadgeUrl} className="h-8 w-8 rounded-full" fallbackClassName="text-[10px]" />
                  <span>{resolvedDetail.homeTeam}</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Venue</dt>
                <dd className="text-right font-medium">{resolvedDetail.venue ?? 'TBD'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="text-right font-medium">{resolvedDetail.status ?? 'Unknown'}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      <StationResults event={event} />
    </section>
  )
}

export default ExpandedGameCard