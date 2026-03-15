import React from 'react'
import type { YtVideo } from '../../../../shared/ipc-types'
import { formatRelativeTime } from '../../lib/time'

interface VideoCardProps {
  video: YtVideo
}

export function VideoCard({ video }: VideoCardProps): React.ReactElement {
  const handleClick = (): void => {
    const url = `https://www.youtube.com/watch?v=${video.video_id}`
    window.api.invoke('shell:openExternal', url).catch(console.error)
  }

  return (
    <button
      onClick={handleClick}
      className="flex flex-col w-[180px] shrink-0 text-left group cursor-pointer"
    >
      {/* 16:9 thumbnail */}
      <div className="relative w-[180px] h-[101px] rounded-md overflow-hidden bg-muted">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <span className="text-muted-foreground text-xs">No thumbnail</span>
          </div>
        )}
      </div>
      {/* Title */}
      <p className="mt-1 text-xs font-medium line-clamp-2 text-foreground group-hover:text-primary transition-colors leading-tight">
        {video.title}
      </p>
      {/* Date */}
      <p className="mt-0.5 text-xs text-muted-foreground">{formatRelativeTime(video.published_at)}</p>
    </button>
  )
}
