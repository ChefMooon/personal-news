import React, { useEffect, useState } from 'react'
import { Circle, CircleCheck } from 'lucide-react'
import { IPC, type YtVideo } from '../../../../shared/ipc-types'
import { formatAbsoluteTime, formatDuration, formatFutureTime, formatRelativeTime } from '../../lib/time'
import { cn } from '../../lib/utils'

interface VideoCardProps {
  video: YtVideo
  density?: 'compact' | 'detailed'
  channelName?: string
}

function getMediaLabel(video: YtVideo): string {
  if (video.broadcast_status === 'live') {
    return 'LIVE'
  }
  if (video.broadcast_status === 'upcoming') {
    return 'UPCOMING'
  }

  const mediaType =
    video.media_type ?? (video.duration_sec != null && video.duration_sec <= 60 ? 'short' : 'video')

  if (mediaType === 'short') return 'SHORT'
  if (mediaType === 'live') return 'PAST LIVE'
  if (mediaType === 'upcoming_stream') return 'UPCOMING'
  return 'VIDEO'
}

export function VideoCard({
  video,
  density = 'detailed',
  channelName
}: VideoCardProps): React.ReactElement {
  const [watchedAt, setWatchedAt] = useState<number | null>(video.watched_at)

  useEffect(() => {
    setWatchedAt(video.watched_at)
  }, [video.video_id, video.watched_at])

  const isWatched = watchedAt != null

  const saveWatchedState = (nextWatched: boolean): void => {
    window.api.invoke(IPC.YOUTUBE_SET_VIDEO_WATCHED, video.video_id, nextWatched).catch(console.error)
  }

  const handleClick = (): void => {
    const url = `https://www.youtube.com/watch?v=${video.video_id}`
    window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, url).catch(console.error)

    if (!isWatched) {
      const now = Math.floor(Date.now() / 1000)
      setWatchedAt(now)
      saveWatchedState(true)
    }
  }

  const handleWatchedToggle = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    const nextWatched = !isWatched
    setWatchedAt(nextWatched ? Math.floor(Date.now() / 1000) : null)
    saveWatchedState(nextWatched)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const isCompact = density === 'compact'
  const duration = formatDuration(video.duration_sec)
  const publishedRelative = formatRelativeTime(video.published_at)
  const publishedAbsolute = formatAbsoluteTime(video.published_at)
  const scheduledRelative =
    video.scheduled_start != null ? formatFutureTime(video.scheduled_start) : 'Scheduled'
  const scheduledAbsolute =
    video.scheduled_start != null ? formatAbsoluteTime(video.scheduled_start) : null
  const syncedRelative = formatRelativeTime(video.fetched_at)
  const watchedRelative = watchedAt != null ? formatRelativeTime(watchedAt) : null
  const watchedAbsolute = watchedAt != null ? formatAbsoluteTime(watchedAt) : null
  const mediaLabel = getMediaLabel(video)
  const isUpcoming = video.broadcast_status === 'upcoming' || video.media_type === 'upcoming_stream'

  const cardWidth = isCompact ? 'w-[140px]' : 'w-[180px]'
  const thumbHeight = isCompact ? 'h-[79px]' : 'h-[101px]'

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className={cn('flex flex-col shrink-0 text-left group cursor-pointer', cardWidth)}
    >
      {/* 16:9 thumbnail */}
      <div className={cn('relative rounded-md overflow-hidden bg-muted w-full', thumbHeight)}>
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
            style={isWatched ? { filter: 'saturate(0.6)' } : undefined}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="text-muted-foreground text-xs">No thumbnail</span>
          </div>
        )}

        <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {mediaLabel}
        </div>

        <button
          type="button"
          aria-label={isWatched ? 'Mark as unwatched' : 'Mark as watched'}
          title={isWatched ? 'Watched - click to mark unwatched' : 'Unwatched - click to mark watched'}
          onClick={handleWatchedToggle}
          className={cn(
            'absolute right-1.5 top-1.5 rounded bg-black/70 p-1 text-white transition-colors',
            isWatched ? 'hover:bg-black/80' : 'hover:bg-black/80'
          )}
        >
          {isWatched ? (
            <CircleCheck className="h-3.5 w-3.5 text-emerald-300" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-white/85" />
          )}
        </button>

        {duration ? (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {duration}
          </div>
        ) : null}
      </div>

      {/* Title */}
      <p
        className="mt-1 text-xs font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight"
        style={isWatched ? { filter: 'brightness(0.9)' } : undefined}
      >
        {video.title}
      </p>

      {channelName ? <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{channelName}</p> : null}

      {/* Date info — full in detailed mode, condensed in compact */}
      {isCompact ? (
        isUpcoming ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground" title={scheduledAbsolute ?? undefined}>
            {scheduledRelative}
          </p>
        ) : (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{publishedRelative}</p>
        )
      ) : (
        <>
          {isUpcoming ? (
            <p className="mt-0.5 text-xs text-muted-foreground" title={scheduledAbsolute ?? undefined}>
              {scheduledRelative}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground" title={publishedAbsolute}>
              Published {publishedRelative}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/80">Synced {syncedRelative}</p>
          {watchedRelative ? (
            <p className="text-[10px] text-muted-foreground/80" title={watchedAbsolute ?? undefined}>
              Watched {watchedRelative}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
