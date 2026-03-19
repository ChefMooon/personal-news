import React from 'react'
import type { YtChannel, YtVideo, YouTubeViewConfig } from '../../../../shared/ipc-types'
import { useYouTubeVideos } from '../../hooks/useYouTubeVideos'
import { StreamPanel } from './StreamPanel'
import { VideoCarousel } from './VideoCarousel'
import { Separator } from '../../components/ui/separator'

interface ChannelRowProps {
  channel: YtChannel
  viewConfig: YouTubeViewConfig
}

function inferMediaType(video: YtVideo): 'video' | 'short' | 'upcoming_stream' | 'live' {
  if (video.broadcast_status === 'live') return 'live'
  if (video.broadcast_status === 'upcoming') return 'upcoming_stream'
  if (video.media_type != null) return video.media_type
  if (video.duration_sec != null && video.duration_sec <= 60) return 'short'
  return 'video'
}

function applyMediaTypeFilter(videos: YtVideo[], config: YouTubeViewConfig): YtVideo[] {
  return videos.filter((video) => {
    if (video.broadcast_status === 'live') {
      return config.showLiveNow
    }

    if (video.broadcast_status === 'upcoming') {
      return config.showUpcomingStreams
    }

    const mediaType = inferMediaType(video)
    if (mediaType === 'short') {
      return config.showShorts
    }

    if (mediaType === 'live') {
      return config.showPastLivestreams
    }

    return config.showVideos
  })
}

export function ChannelRow({ channel, viewConfig }: ChannelRowProps): React.ReactElement {
  const { videos } = useYouTubeVideos(channel.channel_id)
  const filteredVideos = applyMediaTypeFilter(videos, viewConfig)

  const streams = filteredVideos.filter(
    (v) => v.broadcast_status === 'upcoming' || v.broadcast_status === 'live'
  )
  const regularVideos = filteredVideos.filter(
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
