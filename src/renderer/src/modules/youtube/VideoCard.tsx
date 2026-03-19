import React from 'react'
import type { YtVideo } from '../../../../shared/ipc-types'
import { formatAbsoluteTime, formatDuration, formatRelativeTime } from '../../lib/time'
import { cn } from '../../lib/utils'

interface VideoCardProps {
  video: YtVideo
  density?: 'compact' | 'detailed'
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

export function VideoCard({ video, density = 'detailed' }: VideoCardProps): React.ReactElement {
  const handleClick = (): void => {
    const url = `https://www.youtube.com/watch?v=${video.video_id}`
    window.api.invoke('shell:openExternal', url).catch(console.error)
  }

  const isCompact = density === 'compact'
  const duration = formatDuration(video.duration_sec)
  const publishedRelative = formatRelativeTime(video.published_at)
  const publishedAbsolute = formatAbsoluteTime(video.published_at)
  const syncedRelative = formatRelativeTime(video.fetched_at)
  const mediaLabel = getMediaLabel(video)

  const cardWidth = isCompact ? 'w-[140px]' : 'w-[180px]'
  const thumbHeight = isCompact ? 'h-[79px]' : 'h-[101px]'

  return (
    <button
      onClick={handleClick}
      className={cn('flex flex-col shrink-0 text-left group cursor-pointer', cardWidth)}
    >
      {/* 16:9 thumbnail */}
      <div className={cn('relative rounded-md overflow-hidden bg-muted w-full', thumbHeight)}>
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
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

        {duration ? (
          <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {duration}
          </div>
        ) : null}
      </div>

      {/* Title */}
      <p className="mt-1 text-xs font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
        {video.title}
      </p>

      {/* Date info — full in detailed mode, condensed in compact */}
      {isCompact ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{publishedRelative}</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground" title={publishedAbsolute}>
            Published {publishedRelative}
          </p>
          <p className="text-[10px] text-muted-foreground/80">Synced {syncedRelative}</p>
        </>
      )}
    </button>
  )
}
