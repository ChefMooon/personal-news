import React from 'react'
import { ScrollArea, ScrollBar } from '../../components/ui/scroll-area'
import { VideoCard } from './VideoCard'
import type { YtVideo } from '../../../../shared/ipc-types'

interface VideoCarouselProps {
  videos: YtVideo[]
}

export function VideoCarousel({ videos }: VideoCarouselProps): React.ReactElement {
  if (videos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">No recent videos.</p>
    )
  }

  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 pb-3">
        {videos.map((video) => (
          <VideoCard key={video.video_id} video={video} />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
