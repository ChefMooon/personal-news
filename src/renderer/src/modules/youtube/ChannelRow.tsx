import React from 'react'
import type { YtChannel } from '../../../../shared/ipc-types'
import { useYouTubeVideos } from '../../hooks/useYouTubeVideos'
import { StreamPanel } from './StreamPanel'
import { VideoCarousel } from './VideoCarousel'
import { Separator } from '../../components/ui/separator'

interface ChannelRowProps {
  channel: YtChannel
}

export function ChannelRow({ channel }: ChannelRowProps): React.ReactElement {
  const { videos } = useYouTubeVideos(channel.channel_id)

  const streams = videos.filter(
    (v) => v.broadcast_status === 'upcoming' || v.broadcast_status === 'live'
  )
  const regularVideos = videos.filter(
    (v) => v.broadcast_status === 'none' || v.broadcast_status === null
  )

  return (
    <div className="py-3">
      {/* Channel header */}
      <div className="flex items-center gap-2 mb-3">
        {channel.thumbnail_url ? (
          <img
            src={channel.thumbnail_url}
            alt={channel.name}
            className="w-8 h-8 rounded-full object-cover bg-muted"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <span className="text-xs text-muted-foreground">{channel.name[0]}</span>
          </div>
        )}
        <span className="font-medium text-sm">{channel.name}</span>
      </div>

      {/* Content row: StreamPanel (left) + VideoCarousel (right) */}
      <div className="flex gap-4">
        <StreamPanel streams={streams} />
        {streams.length > 0 && <Separator orientation="vertical" className="h-auto" />}
        <div className="flex-1 min-w-0">
          <VideoCarousel videos={regularVideos} />
        </div>
      </div>
    </div>
  )
}
