import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { YtVideo } from '../../../../shared/ipc-types'
import { formatFutureTime, formatRelativeTime } from '../../lib/time'
import { isActiveLivestream } from './video-lifecycle'

interface StreamPanelProps {
  streams: YtVideo[]
}

export function StreamPanel({ streams }: StreamPanelProps): React.ReactElement {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const now = Math.floor(Date.now() / 1000)
  const upcomingStreams = [...streams]
    .filter((stream) => {
      if (!isActiveLivestream(stream)) {
        return false
      }

      if (stream.broadcast_status === 'live') {
        return true
      }

      return stream.scheduled_start == null || stream.scheduled_start > now
    })
    .sort((left, right) => {
      const leftPriority = left.broadcast_status === 'live' ? 0 : 1
      const rightPriority = right.broadcast_status === 'live' ? 0 : 1
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      const leftTime =
        left.broadcast_status === 'live'
          ? left.actual_start_time ?? left.scheduled_start ?? left.published_at
          : left.scheduled_start ?? left.published_at
      const rightTime =
        right.broadcast_status === 'live'
          ? right.actual_start_time ?? right.scheduled_start ?? right.published_at
          : right.scheduled_start ?? right.published_at

      return leftTime - rightTime
    })

  return (
    <div className="flex flex-col gap-2 w-[200px] shrink-0">
      <h4 className="text-xs font-medium text-foreground">Upcoming Streams</h4>
      {upcomingStreams.length === 0 ? (
        <p className="text-xs text-muted-foreground">No upcoming streams</p>
      ) : (
      <div className="flex flex-col rounded-md border border-border divide-y divide-border overflow-hidden bg-card">
        {upcomingStreams.map((stream) => (
          <button
            key={stream.video_id}
            type="button"
            onClick={() => {
              const url = `https://www.youtube.com/watch?v=${stream.video_id}`
              window.api.invoke('shell:openExternal', url).catch((err) => {
                toast.error(err instanceof Error ? err.message : 'Failed to open stream.')
              })
            }}
            className="w-full text-left px-3 py-2 group cursor-pointer transition-colors hover:bg-accent/40"
          >
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium line-clamp-2 leading-tight text-card-foreground group-hover:text-primary transition-colors">
                {stream.title}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {stream.broadcast_status === 'live'
                  ? `Live now${stream.actual_start_time ? ` · started ${formatRelativeTime(stream.actual_start_time)}` : ''}`
                  : stream.scheduled_start
                    ? formatFutureTime(stream.scheduled_start)
                    : 'Upcoming'}
              </p>
            </div>
          </button>
        ))}
      </div>
      )}
    </div>
  )
}
