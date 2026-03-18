import React from 'react'
import type { YtVideo } from '../../../../shared/ipc-types'
import { Badge } from '../../components/ui/badge'
import { Card } from '../../components/ui/card'
import { formatFutureTime } from '../../lib/time'

interface StreamPanelProps {
  streams: YtVideo[]
}

export function StreamPanel({ streams }: StreamPanelProps): React.ReactElement {
  if (streams.length === 0) {
    return (
      <div className="w-[160px] shrink-0">
        <p className="text-xs text-muted-foreground italic">No upcoming streams</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 w-[160px] shrink-0">
      {streams.map((stream) => (
        <button
          key={stream.video_id}
          onClick={() => {
            const url = `https://www.youtube.com/watch?v=${stream.video_id}`
            window.api.invoke('shell:openExternal', url).catch(console.error)
          }}
          className="w-full text-left group cursor-pointer"
        >
          <Card className="overflow-hidden border-border bg-card transition-colors group-hover:bg-accent/40 group-hover:border-primary/40">
            <div className="relative w-full h-[90px] bg-muted">
              {stream.thumbnail_url ? (
                <img
                  src={stream.thumbnail_url}
                  alt={stream.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted" />
              )}
              <div className="absolute top-1 left-1">
                {stream.broadcast_status === 'live' ? (
                  <Badge variant="live" className="text-[10px] px-1.5 py-0.5">LIVE NOW</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                    {stream.scheduled_start
                      ? formatFutureTime(stream.scheduled_start)
                      : 'Upcoming'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-2">
              <p className="text-xs font-medium line-clamp-2 group-hover:text-primary transition-colors leading-tight text-card-foreground">
                {stream.title}
              </p>
            </div>
          </Card>
        </button>
      ))}
    </div>
  )
}
