import React from 'react'
import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area'
import { VideoCard } from './VideoCard'
import type { YtVideo } from '../../../../shared/ipc-types'

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
  let displayVideos = maxItems > 0 ? videos.slice(0, maxItems) : videos
  if (sortDirection === 'oldest') {
    displayVideos = [...displayVideos].reverse()
  }

  if (displayVideos.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">No recent videos.</p>
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 pb-3">
        {displayVideos.map((video) => (
          <VideoCard key={video.video_id} video={video} density={density} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
