import type { MediaType, YtVideo } from '../../../../shared/ipc-types'

export function inferMediaType(video: YtVideo): MediaType {
  if (video.broadcast_status === 'live') return 'live'
  if (video.broadcast_status === 'upcoming') return 'upcoming_stream'
  if (video.is_livestream === 1) return 'live'
  if (video.media_type != null) return video.media_type
  if (video.duration_sec != null && video.duration_sec <= 60) return 'short'
  return 'video'
}

export function isActiveLivestream(video: YtVideo): boolean {
  return video.broadcast_status === 'live' || video.broadcast_status === 'upcoming'
}

export function getYouTubeLifecycleSortTime(video: YtVideo): number {
  if (video.broadcast_status === 'upcoming') {
    return video.scheduled_start ?? video.published_at
  }
  if (video.broadcast_status === 'live') {
    return video.actual_start_time ?? video.scheduled_start ?? video.published_at
  }
  if (video.is_livestream === 1) {
    return video.actual_end_time ?? video.actual_start_time ?? video.published_at
  }
  return video.published_at
}
