import React from 'react'
import { LoaderCircle, Minimize2, Pause, Play, Radio, Square, Volume2, X } from 'lucide-react'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { useRadioPlayer } from '../contexts/RadioPlayerContext'

function getStatusLabel(isConnecting: boolean, isPlaying: boolean): { label: string; className: string } {
  if (isConnecting) {
    return { label: 'Connecting', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200' }
  }

  if (isPlaying) {
    return { label: 'Live', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200' }
  }

  return { label: 'Paused', className: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200' }
}

export function RadioPlayer(): React.ReactElement | null {
  const { isOpen, isPlaying, isConnecting, station, gameLabel, volume, togglePlayback, stop, setVolume } = useRadioPlayer()
  const [isMinimized, setIsMinimized] = React.useState(false)

  React.useEffect(() => {
    if (station) {
      setIsMinimized(false)
    }
  }, [station])

  if (!isOpen || !station) {
    return null
  }

  const status = getStatusLabel(isConnecting, isPlaying)

  if (isMinimized) {
    return (
      <div className="pointer-events-none fixed bottom-20 right-6 z-30 w-[min(280px,calc(100vw-2rem))]">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
          {station.favicon ? (
            <img
              src={station.favicon}
              alt=""
              className="h-9 w-9 rounded-lg border bg-muted object-cover"
              onError={(event) => {
                ;(event.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Radio className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{station.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{gameLabel ?? 'Sports radio'}</p>
          </div>

          <Badge variant="outline" className={status.className}>{status.label}</Badge>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => void togglePlayback()} aria-label={isPlaying ? 'Pause radio playback' : 'Play radio playback'}>
            {isConnecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setIsMinimized(false)} aria-label="Expand radio player">
            <Radio className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={stop} aria-label="Close radio player">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed bottom-20 right-6 z-30 w-[min(420px,calc(100vw-2rem))]">
      <div className="pointer-events-auto rounded-2xl border bg-card/95 p-4 shadow-2xl backdrop-blur">
        <div className="mb-3 flex justify-end gap-1">
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsMinimized(true)} aria-label="Minimize radio player">
            <Minimize2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={stop} aria-label="Close radio player">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-start gap-3">
          {station.favicon ? (
            <img
              src={station.favicon}
              alt=""
              className="h-12 w-12 rounded-xl border bg-muted object-cover"
              onError={(event) => {
                ;(event.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
              <Radio className="h-5 w-5" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{station.name}</p>
                <p className="truncate text-xs text-muted-foreground">{gameLabel ?? 'Sports radio'}</p>
              </div>
              <Badge variant="outline" className={status.className}>{status.label}</Badge>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              {station.country ? <span>{station.country}</span> : null}
              {station.codec ? <span>{station.codec.toUpperCase()}</span> : null}
              {station.bitrate ? <span>{station.bitrate} kbps</span> : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void togglePlayback()}>
            {isConnecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={stop}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(event) => setVolume(Number.parseInt(event.target.value, 10) / 100)}
              className="h-2 w-28 accent-primary"
              aria-label="Radio player volume"
            />
          </div>
        </div>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Stations are community-listed. Coverage is best-effort and may be unavailable for some games.
        </p>
      </div>
    </div>
  )
}

export default RadioPlayer