import React from 'react'
import { toast } from 'sonner'
import { CheckCheck, ChevronDown, ChevronRight } from 'lucide-react'
import { IPC, type YtChannel, type YtVideo, type YouTubeViewConfig } from '../../../../shared/ipc-types'
import { useYouTubeVideos } from '../../hooks/useYouTubeVideos'
import { StreamPanel } from './StreamPanel'
import { VideoCarousel } from './VideoCarousel'
import { Separator } from '../../components/ui/separator'

interface ChannelRowProps {
  channel: YtChannel
  viewConfig: YouTubeViewConfig
  isCollapsed: boolean
  onToggleCollapse: () => void
}

function inferMediaType(video: YtVideo): 'video' | 'short' | 'upcoming_stream' | 'live' {
  if (video.broadcast_status === 'live') return 'live'
  if (video.broadcast_status === 'upcoming') return 'upcoming_stream'
  if (video.media_type != null) return video.media_type
  if (video.duration_sec != null && video.duration_sec <= 60) return 'short'
  return 'video'
}

function getEffectiveConfig(viewConfig: YouTubeViewConfig, channelId: string): YouTubeViewConfig {
  const override = viewConfig.perChannelMediaOverrides?.[channelId]
  if (!override || Object.keys(override).length === 0) return viewConfig
  return { ...viewConfig, ...override }
}

function applyMediaTypeFilter(videos: YtVideo[], config: YouTubeViewConfig): YtVideo[] {
  return videos.filter((video) => {
    if (config.hideWatched && video.watched_at != null) return false
    if (video.broadcast_status === 'live') return config.showLiveNow
    if (video.broadcast_status === 'upcoming') return config.showUpcomingStreams
    const mediaType = inferMediaType(video)
    if (mediaType === 'short') return config.showShorts
    if (mediaType === 'live') return config.showPastLivestreams
    return config.showVideos
  })
}

export function ChannelRow({
  channel,
  viewConfig,
  isCollapsed,
  onToggleCollapse
}: ChannelRowProps): React.ReactElement {
  const { videos } = useYouTubeVideos(channel.channel_id)

  const effectiveConfig = getEffectiveConfig(viewConfig, channel.channel_id)
  const filteredVideos = applyMediaTypeFilter(videos, effectiveConfig)
  const watchedCount = videos.filter((video) => video.watched_at != null).length
  const totalCount = videos.length

  const handleMarkAllWatched = (e: React.MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation()
    window.api.invoke(IPC.YOUTUBE_MARK_CHANNEL_WATCHED, channel.channel_id).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all channel videos as watched.')
    })
  }

  const streams = filteredVideos.filter(
    (v) => v.broadcast_status === 'upcoming' || v.broadcast_status === 'live'
  )
  const regularVideos = filteredVideos.filter(
    (v) => v.broadcast_status === 'none' || v.broadcast_status === null
  )

  // When headers are hidden there is no collapse toggle — content is always visible
  const isContentVisible = !viewConfig.showChannelHeaders || !isCollapsed

  return (
    <div className="py-3">
      {/* Channel header — doubles as collapse toggle */}
      {viewConfig.showChannelHeaders && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 min-w-0 flex-1 text-left group/header"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
          >
            {channel.thumbnail_url ? (
              <img
                src={channel.thumbnail_url}
                alt={channel.name}
                className="w-8 h-8 rounded-full object-cover bg-muted shrink-0"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs text-muted-foreground">{channel.name[0]}</span>
              </div>
            )}
            <span className="font-medium text-sm truncate">{channel.name}</span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {watchedCount}/{totalCount} watched
            </span>
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover/header:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground group-hover/header:text-foreground transition-colors" />
            )}
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={handleMarkAllWatched}
            title="Mark all videos in this channel as watched"
            aria-label="Mark all videos watched"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all
          </button>
        </div>
      )}

      {/* Content: StreamPanel (left) + VideoCarousel (right) */}
      {isContentVisible && (
        <div className="flex gap-4">
          {viewConfig.showUpcomingPanel && (
            <>
              <StreamPanel streams={streams} />
              <Separator orientation="vertical" className="h-auto" />
            </>
          )}
          <div className="flex-1 min-w-0">
            <VideoCarousel
              videos={regularVideos}
              maxItems={viewConfig.maxVideosPerChannel}
              sortDirection={viewConfig.videoSortDirection}
              density={viewConfig.cardDensity}
            />
          </div>
        </div>
      )}
    </div>
  )
}
