import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type RadioStation, type SportEvent } from '../../../shared/ipc-types'

const STREAM_TIMEOUT_MS = 8_000
const DEFAULT_VOLUME = 0.8

/**
 * Electron wraps IPC rejections with a prefix like:
 *   "Error invoking remote method 'channel:name': Error: <actual message>"
 * This strips that boilerplate so users see the real error text.
 */
function extractIpcErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const match = raw.match(/^Error invoking remote method '[^']+': Error: (.+)$/)
  return match?.[1]?.trim() ?? raw
}

interface RadioPlayerState {
  isOpen: boolean
  isPlaying: boolean
  isConnecting: boolean
  station: RadioStation | null
  gameLabel: string | null
  volume: number
  stations: RadioStation[]
  stationsLoading: boolean
}

interface RadioPlayerContextValue extends RadioPlayerState {
  searchGameKey: string | null
  searchError: string | null
  searchStations: (game: SportEvent) => Promise<void>
  dismissSearchResults: () => void
  playStation: (station: RadioStation, gameLabel: string) => Promise<void>
  togglePlayback: () => Promise<void>
  stop: () => void
  setVolume: (volume: number) => void
}

const RadioPlayerContext = createContext<RadioPlayerContextValue | null>(null)

export function formatRadioGameLabel(game: SportEvent): string {
  return `${game.awayTeam} vs ${game.homeTeam}`
}

export function RadioPlayerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const connectTimeoutRef = useRef<number | null>(null)
  const timedOutRef = useRef(false)
  // volumeRef mirrors state.volume so async callbacks always read the latest value
  const volumeRef = useRef(DEFAULT_VOLUME)
  const [state, setState] = useState<RadioPlayerState>({
    isOpen: false,
    isPlaying: false,
    isConnecting: false,
    station: null,
    gameLabel: null,
    volume: DEFAULT_VOLUME,
    stations: [],
    stationsLoading: false
  })
  const [searchGameKey, setSearchGameKey] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'none'
    audio.volume = DEFAULT_VOLUME
    audioRef.current = audio

    const clearConnectTimeout = (): void => {
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current)
        connectTimeoutRef.current = null
      }
    }

    const handleLoadStart = (): void => {
      setState((current) => ({ ...current, isConnecting: true }))
    }

    const handlePlaying = (): void => {
      timedOutRef.current = false
      clearConnectTimeout()
      setState((current) => ({ ...current, isOpen: true, isConnecting: false, isPlaying: true }))
    }

    const handlePause = (): void => {
      setState((current) => ({ ...current, isPlaying: false, isConnecting: false }))
    }

    const handleWaiting = (): void => {
      setState((current) => current.station ? { ...current, isConnecting: true } : current)
    }

    // canplay fires when enough data is buffered to play, but the audio isn't
    // necessarily playing yet — only clear the connecting spinner here.
    const handleCanPlay = (): void => {
      clearConnectTimeout()
      setState((current) => ({ ...current, isConnecting: false }))
    }

    const handleError = (): void => {
      clearConnectTimeout()
      setState((current) => ({ ...current, isConnecting: false, isPlaying: false }))

      if (!timedOutRef.current) {
        toast.error('Stream unavailable.', {
          description: 'Stations are community-listed — coverage is not guaranteed.'
        })
      }

      timedOutRef.current = false
    }

    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('playing', handlePlaying)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('waiting', handleWaiting)
    audio.addEventListener('stalled', handleWaiting)
    audio.addEventListener('error', handleError)

    return () => {
      clearConnectTimeout()
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('playing', handlePlaying)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('waiting', handleWaiting)
      audio.removeEventListener('stalled', handleWaiting)
      audio.removeEventListener('error', handleError)
      audioRef.current = null
    }
  }, [])

  const searchStations = async (game: SportEvent): Promise<void> => {
    setSearchGameKey(game.eventId)
    setSearchError(null)
    setState((current) => ({ ...current, stationsLoading: true, stations: [] }))

    try {
      const stations = (await window.api.invoke(IPC.SPORTS_SEARCH_RADIO_STATIONS, { game })) as RadioStation[]
      setState((current) => ({ ...current, stationsLoading: false, stations }))

      if (stations.length === 0) {
        setSearchError('No playable stations found for this matchup.')
      }
    } catch (error) {
      setSearchError(extractIpcErrorMessage(error) ?? 'Failed to search radio stations.')
      setState((current) => ({ ...current, stationsLoading: false, stations: [] }))
    }
  }

  const dismissSearchResults = (): void => {
    setSearchGameKey(null)
    setSearchError(null)
    setState((current) => ({
      ...current,
      stationsLoading: false,
      stations: []
    }))
  }

  const playStation = async (station: RadioStation, gameLabel: string): Promise<void> => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }

    timedOutRef.current = false
    audio.pause()

    setState((current) => ({
      ...current,
      isOpen: true,
      isPlaying: false,
      isConnecting: true,
      station,
      gameLabel
    }))

    let streamUrl: string

    try {
      streamUrl = station.playableStreamUrl
        ?? ((await window.api.invoke(IPC.SPORTS_RESOLVE_RADIO_STREAM, { url: station.urlResolved })) as string)
    } catch (error) {
      setState((current) => ({ ...current, isPlaying: false, isConnecting: false }))
      toast.error(extractIpcErrorMessage(error) ?? 'Unable to resolve a playable radio stream.')
      return
    }

    audio.src = streamUrl
    audio.load()
    // Use volumeRef so we always apply the latest volume even if the user
    // adjusted it while the stream was resolving via IPC.
    audio.volume = volumeRef.current

    connectTimeoutRef.current = window.setTimeout(() => {
      timedOutRef.current = true
      audio.pause()
      setState((current) => ({ ...current, isPlaying: false, isConnecting: false }))
      toast.error('Stream unavailable.', {
        description: 'Stations are community-listed — coverage is not guaranteed.'
      })
    }, STREAM_TIMEOUT_MS)

    try {
      await audio.play()
    } catch (error) {
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current)
        connectTimeoutRef.current = null
      }
      setState((current) => ({ ...current, isPlaying: false, isConnecting: false }))
      // The audio element's 'error' event fires for media failures (unsupported
      // codec, network error, etc.) and already shows a toast via handleError.
      // Only surface a separate toast for autoplay policy blocks (NotAllowedError),
      // which don't trigger the element's error event.
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        toast.error('Autoplay blocked. Click play to start the stream.')
      } else if (!(error instanceof DOMException)) {
        toast.error(error instanceof Error ? error.message : 'Unable to start radio playback.')
      }
    }
  }

  const togglePlayback = async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio || !state.station) {
      return
    }

    if (state.isPlaying) {
      audio.pause()
      return
    }

    // Live radio streams are not seekable — the buffered position becomes stale
    // as soon as playback is paused. Reconnect from scratch instead of resuming.
    await playStation(state.station, state.gameLabel ?? 'Sports radio')
  }

  const stop = (): void => {
    const audio = audioRef.current
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }

    timedOutRef.current = false
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }

    setState((current) => ({
      ...current,
      isOpen: false,
      isPlaying: false,
      isConnecting: false,
      station: null,
      gameLabel: null
    }))
  }

  const setVolume = (volume: number): void => {
    const normalized = Math.max(0, Math.min(1, volume))
    volumeRef.current = normalized
    if (audioRef.current) {
      audioRef.current.volume = normalized
    }
    setState((current) => ({ ...current, volume: normalized }))
  }

  return (
    <RadioPlayerContext.Provider
      value={{
        ...state,
        searchGameKey,
        searchError,
        searchStations,
        dismissSearchResults,
        playStation,
        togglePlayback,
        stop,
        setVolume
      }}
    >
      {children}
    </RadioPlayerContext.Provider>
  )
}

export function useRadioPlayer(): RadioPlayerContextValue {
  const context = useContext(RadioPlayerContext)
  if (!context) {
    throw new Error('useRadioPlayer must be used within a RadioPlayerProvider.')
  }

  return context
}