import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { YtVideo } from '../../../../shared/ipc-types'
import { formatFutureTime } from '../../lib/time'

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
  const upcomingStreams = streams.filter(
    (stream) =>
      stream.broadcast_status === 'upcoming' &&
      (stream.scheduled_start == null || stream.scheduled_start > now)
  )

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
                {stream.scheduled_start ? formatFutureTime(stream.scheduled_start) : 'Upcoming'}
              </p>
            </div>
          </button>
        ))}
      </div>
      )}
    </div>
  )
}
