import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area'
import type { SportEvent } from '../../../../shared/ipc-types'
import { cn } from '../../lib/utils'
import { formatEventTime, getStatusText, sortSportsPageEvents } from './page-utils'
import { TeamAvatar } from './TeamAvatar'
import { getGamePhase, isLiveStatus } from './utils'

function TeamChip({ name, badgeUrl }: { name: string; badgeUrl: string | null }): React.ReactElement {
  return <TeamAvatar name={name} src={badgeUrl} className="h-7 w-7 rounded-full" fallbackClassName="text-[10px]" />
}

export function TodayGamesStrip({
  events,
  collapsed,
  onCollapsedChange,
  autoScrollEventId,
  selectedEventId,
  onSelect
}: {
  events: SportEvent[]
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  autoScrollEventId: string | null
  selectedEventId: string | null
  onSelect: (event: SportEvent) => void
}): React.ReactElement {
  const sortedEvents = useMemo(() => [...events].sort(sortSportsPageEvents), [events])
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const lastAutoScrolledEventIdRef = useRef<string | null>(null)
  const hasAutoScrolledRef = useRef(false)
  const liveCount = useMemo(() => sortedEvents.filter((event) => isLiveStatus(event.status)).length, [sortedEvents])
  const selectedEvent = useMemo(
    () => sortedEvents.find((event) => event.eventId === selectedEventId) ?? sortedEvents[0] ?? null,
    [selectedEventId, sortedEvents]
  )
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const getViewport = useCallback((): HTMLDivElement | null => {
    if (!scrollAreaRef.current) {
      return null
    }

    return scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
  }, [])

  const updateScrollState = useCallback((): void => {
    const viewport = getViewport()
    if (!viewport || collapsed || sortedEvents.length === 0) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth
    setCanScrollLeft(viewport.scrollLeft > 4)
    setCanScrollRight(viewport.scrollLeft < maxScrollLeft - 4)
  }, [collapsed, getViewport, sortedEvents.length])

  const scrollCards = useCallback((direction: 'left' | 'right'): void => {
    const viewport = getViewport()
    if (!viewport) {
      return
    }

    const distance = Math.max(Math.round(viewport.clientWidth * 0.85), 320)
    viewport.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth'
    })
  }, [getViewport])

  useEffect(() => {
    if (collapsed || sortedEvents.length === 0) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const viewport = getViewport()
    if (!viewport) {
      return
    }

    updateScrollState()
    viewport.addEventListener('scroll', updateScrollState, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      updateScrollState()
    })

    resizeObserver.observe(viewport)
    if (viewport.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(viewport.firstElementChild)
    }

    return () => {
      viewport.removeEventListener('scroll', updateScrollState)
      resizeObserver.disconnect()
    }
  }, [collapsed, getViewport, sortedEvents.length, updateScrollState])

  useEffect(() => {
    if (collapsed) {
      return
    }

    if (!autoScrollEventId) {
      lastAutoScrolledEventIdRef.current = null
      return
    }

    if (lastAutoScrolledEventIdRef.current === autoScrollEventId) {
      return
    }

    const targetCard = cardRefs.current[autoScrollEventId]
    if (!targetCard) {
      return
    }

    const behavior = hasAutoScrolledRef.current ? 'smooth' : 'auto'
    lastAutoScrolledEventIdRef.current = autoScrollEventId
    hasAutoScrolledRef.current = true
    targetCard.scrollIntoView({ block: 'nearest', inline: 'center', behavior })
    window.requestAnimationFrame(() => {
      updateScrollState()
    })
  }, [autoScrollEventId, collapsed, updateScrollState])

  return (
    <section className="rounded-[28px] border border-border/70 bg-gradient-to-br from-card via-card to-muted/20 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">Today&apos;s Games</h2>
            <Badge variant="outline">{sortedEvents.length} games</Badge>
            {liveCount > 0 ? <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">{liveCount} live</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {collapsed
              ? 'Quick schedule strip for today. Expand to browse and jump into the nearest matchup.'
              : 'Live games are listed first, followed by upcoming starts and finals.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!collapsed && sortedEvents.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => scrollCards('left')}
                disabled={!canScrollLeft}
                aria-label="Scroll today's games left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => scrollCards('right')}
                disabled={!canScrollRight}
                aria-label="Scroll today's games right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => onCollapsedChange(!collapsed)}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
        </div>
      </div>

      {collapsed && selectedEvent ? (
        <button
          type="button"
          onClick={() => onSelect(selectedEvent)}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-left transition-colors hover:bg-accent/30"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] uppercase tracking-[0.14em]">
                {selectedEvent.sport}
              </Badge>
              {isLiveStatus(selectedEvent.status) ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">Live</Badge>
              ) : null}
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <TeamChip name={selectedEvent.awayTeam} badgeUrl={selectedEvent.awayTeamBadgeUrl} />
                <p className="truncate text-sm font-semibold">{selectedEvent.awayTeam}</p>
              </div>
              <div className="flex items-center gap-2">
                <TeamChip name={selectedEvent.homeTeam} badgeUrl={selectedEvent.homeTeamBadgeUrl} />
                <p className="truncate text-sm font-semibold">{selectedEvent.homeTeam}</p>
              </div>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {getGamePhase(selectedEvent) === 'scheduled' ? formatEventTime(selectedEvent) : getStatusText(selectedEvent)}
              {selectedEvent.venue ? ` · ${selectedEvent.venue}` : ''}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold tabular-nums">{selectedEvent.awayScore ?? '—'} - {selectedEvent.homeScore ?? '—'}</p>
            <p className="text-xs text-muted-foreground">Selected game</p>
          </div>
        </button>
      ) : null}

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out',
          collapsed ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-4 grid-rows-[1fr] opacity-100'
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {sortedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
              No games are scheduled today for the currently enabled sports leagues.
            </div>
          ) : (
            <ScrollArea ref={scrollAreaRef} className="rounded-[24px] border border-border/70 bg-background/75 pb-4 shadow-inner">
              <div className="flex min-w-max snap-x snap-mandatory gap-3 px-3 pt-3 pb-0">
                {sortedEvents.map((event) => {
                  const selected = selectedEventId === event.eventId
                  const live = isLiveStatus(event.status)
                  const phase = getGamePhase(event)

                  return (
                    <button
                      key={event.eventId}
                      ref={(node) => {
                        cardRefs.current[event.eventId] = node
                      }}
                      type="button"
                      onClick={() => onSelect(event)}
                      aria-pressed={selected}
                      className={cn(
                        'w-72 shrink-0 snap-center rounded-2xl border px-4 py-3 text-left shadow-sm transition-[transform,colors,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'bg-background hover:bg-accent/40 hover:shadow-md',
                        live && 'border-emerald-500/40 bg-emerald-500/5'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {live ? <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" /> : null}
                            <p className="truncate text-xs uppercase tracking-[0.18em] text-muted-foreground">{event.sport}</p>
                          </div>
                          <p className="mt-2 truncate text-sm font-semibold">{event.awayTeam}</p>
                          <p className="truncate text-sm font-semibold">{event.homeTeam}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge variant="outline" className={cn(live && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200')}>
                            {phase === 'scheduled' ? 'Scheduled' : phase === 'finished' ? 'Final' : 'Live'}
                          </Badge>
                          <p className="mt-2 text-xs text-muted-foreground">{phase === 'scheduled' ? formatEventTime(event) : getStatusText(event)}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <TeamChip name={event.awayTeam} badgeUrl={event.awayTeamBadgeUrl} />
                            <span className="text-xs text-muted-foreground">Away</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TeamChip name={event.homeTeam} badgeUrl={event.homeTeamBadgeUrl} />
                            <span className="text-xs text-muted-foreground">Home</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-semibold tabular-nums">{event.awayScore ?? '—'} - {event.homeScore ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{event.venue ?? 'Venue TBD'}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
              <ScrollBar orientation="horizontal" className="bottom-2 left-3 right-3 h-3.5 p-[2px]" />
            </ScrollArea>
          )}
        </div>
      </div>
    </section>
  )
}

export default TodayGamesStrip