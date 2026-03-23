import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area'
import { VideoCard } from './VideoCard'
import type { YtVideo } from '../../../../shared/ipc-types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface VideoCarouselProps {
  videos: YtVideo[]
  maxItems?: number
  sortDirection?: 'newest' | 'oldest'
  density?: 'compact' | 'detailed'
}

export function VideoCarousel({
  videos,
  maxItems = 15,
  sortDirection = 'newest',
  density = 'detailed'
}: VideoCarouselProps): React.ReactElement {
  const scrollRootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const cardsContainerRef = useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  let displayVideos = maxItems > 0 ? videos.slice(0, maxItems) : videos
  if (sortDirection === 'oldest') {
    displayVideos = [...displayVideos].reverse()
  }

  const updateScrollState = useCallback((): void => {
    const viewport = viewportRef.current
    if (!viewport) {
      setCanScrollLeft(false)
      setCanScrollRight(false)
      return
    }

    const epsilon = 2
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth
    setCanScrollLeft(viewport.scrollLeft > epsilon)
    setCanScrollRight(maxScrollLeft - viewport.scrollLeft > epsilon)
  }, [])

  useEffect(() => {
    const root = scrollRootRef.current
    if (!root) return

    const viewport = root.querySelector<HTMLDivElement>('[data-radix-scroll-area-viewport]')
    if (!viewport) return

    viewportRef.current = viewport
    updateScrollState()

    const handleScroll = (): void => {
      updateScrollState()
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState()
      })
      resizeObserver.observe(viewport)
      if (viewport.firstElementChild) {
        resizeObserver.observe(viewport.firstElementChild)
      }
    }

    const handleResize = (): void => {
      updateScrollState()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [displayVideos.length, updateScrollState])

  const scrollByPage = useCallback((direction: 'left' | 'right'): void => {
    const viewport = viewportRef.current
    if (!viewport) return

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const currentLeft = viewport.scrollLeft
    const pageOverlap = 32

    if (direction === 'right') {
      const cards = Array.from(cardsContainerRef.current?.children ?? []) as HTMLElement[]
      const rightEdge = currentLeft + viewport.clientWidth
      const partiallyVisibleOnRight = cards.find((card) => {
        const cardLeft = card.offsetLeft
        const cardRight = cardLeft + card.offsetWidth
        return cardLeft < rightEdge - 1 && cardRight > rightEdge + 1
      })

      const targetLeft = partiallyVisibleOnRight
        ? Math.min(Math.max(currentLeft, partiallyVisibleOnRight.offsetLeft - pageOverlap), maxScrollLeft)
        : Math.min(currentLeft + viewport.clientWidth - pageOverlap, maxScrollLeft)

      viewport.scrollTo({ left: targetLeft, behavior: 'smooth' })
      return
    }

    const targetLeft = Math.max(0, currentLeft - viewport.clientWidth)
    viewport.scrollTo({ left: targetLeft, behavior: 'smooth' })
  }, [])

  const handleCarouselKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        scrollByPage('left')
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        scrollByPage('right')
      }
    },
    [scrollByPage]
  )

  if (displayVideos.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No recent videos.</p>
  }

  return (
    <div
      className="relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      tabIndex={0}
      role="region"
      aria-label="Video carousel. Use left and right arrow keys to scroll videos."
      onKeyDown={handleCarouselKeyDown}
    >
      {canScrollLeft && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-4 z-[5] w-10 bg-gradient-to-r from-background to-transparent" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-4 z-[5] w-10 bg-gradient-to-l from-background to-transparent" />
      )}

      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll videos left"
          className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-1.5 text-foreground shadow-sm backdrop-blur hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => scrollByPage('left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <ScrollArea ref={scrollRootRef} className="w-full">
        <div ref={cardsContainerRef} className="flex gap-3 pb-3">
          {displayVideos.map((video) => (
            <VideoCard key={video.video_id} video={video} density={density} />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-3.5 p-[2px]" />
      </ScrollArea>

      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll videos right"
          className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-1.5 text-foreground shadow-sm backdrop-blur hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => scrollByPage('right')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
