import React, { useEffect, useMemo, useState } from 'react'
import { IPC, type MediaType, type YtChannel, type YtVideo } from '../../../shared/ipc-types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { useYouTubeChannels } from '../hooks/useYouTubeChannels'
import { useYouTubeVideos } from '../hooks/useYouTubeVideos'
import { useYouTubeVideosFiltered } from '../hooks/useYouTubeVideosFiltered'
import { StreamPanel } from '../modules/youtube/StreamPanel'
import { VideoCard } from '../modules/youtube/VideoCard'
import { VideoCarousel } from '../modules/youtube/VideoCarousel'
import { RefreshCw, Search, Youtube } from 'lucide-react'

const YOUTUBE_PAGE_VIEW_MODE_KEY = 'youtube_page_view_mode'
const YOUTUBE_PAGE_DENSITY_KEY = 'youtube_page_density_by_mode'
const FLAT_PAGE_SIZE = 50

type PageViewMode = 'flat' | 'carousel' | 'grouped'
type CardDensity = 'compact' | 'detailed'

interface DensityByMode {
  flat: CardDensity
  carousel: CardDensity
  grouped: CardDensity
}

const DEFAULT_DENSITY_BY_MODE: DensityByMode = {
  flat: 'detailed',
  carousel: 'detailed',
  grouped: 'detailed'
}

interface PageMediaTypeOption {
  id: MediaType
  label: string
}

const MEDIA_TYPE_OPTIONS: PageMediaTypeOption[] = [
  { id: 'video', label: 'Videos' },
  { id: 'short', label: 'Shorts' },
  { id: 'upcoming_stream', label: 'Upcoming' },
  { id: 'live', label: 'Live / Past Live' }
]

function inferMediaType(video: YtVideo): MediaType {
  if (video.broadcast_status === 'live') return 'live'
  if (video.broadcast_status === 'upcoming') return 'upcoming_stream'
  if (video.media_type != null) return video.media_type
  if (video.duration_sec != null && video.duration_sec <= 60) return 'short'
  return 'video'
}

function matchesMediaTypes(video: YtVideo, selectedMediaTypes: Set<MediaType>): boolean {
  if (selectedMediaTypes.size === 0) {
    return true
  }

  const mediaType = inferMediaType(video)
  return selectedMediaTypes.has(mediaType)
}

function matchesSearch(video: YtVideo, searchQuery: string): boolean {
  if (!searchQuery.trim()) {
    return true
  }
  return video.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
}

function filterVideos(
  videos: YtVideo[],
  searchQuery: string,
  selectedMediaTypes: Set<MediaType>
): YtVideo[] {
  return videos.filter((video) => {
    return matchesMediaTypes(video, selectedMediaTypes) && matchesSearch(video, searchQuery)
  })
}

function computeDisplayedChannels(allChannels: YtChannel[], selectedChannelId: string | null): YtChannel[] {
  const enabledChannels = allChannels.filter((channel) => channel.enabled === 1)
  if (!selectedChannelId) {
    return enabledChannels
  }
  return enabledChannels.filter((channel) => channel.channel_id === selectedChannelId)
}

function ChannelCarouselSection({
  channel,
  selectedMediaTypes,
  searchQuery,
  sortDir,
  density
}: {
  channel: YtChannel
  selectedMediaTypes: Set<MediaType>
  searchQuery: string
  sortDir: 'asc' | 'desc'
  density: CardDensity
}): React.ReactElement | null {
  const { videos, loading } = useYouTubeVideos(channel.channel_id)

  const filteredVideos = useMemo(
    () => filterVideos(videos, searchQuery, selectedMediaTypes),
    [videos, searchQuery, selectedMediaTypes]
  )

  const streams = filteredVideos.filter(
    (video) => video.broadcast_status === 'upcoming' || video.broadcast_status === 'live'
  )
  const regularVideos = filteredVideos.filter(
    (video) => video.broadcast_status === 'none' || video.broadcast_status === null
  )

  if (!loading && filteredVideos.length === 0) {
    return null
  }

  return (
    <section className="rounded-md border p-3">
      <div className="mb-3 flex items-center gap-2">
        {channel.thumbnail_url ? (
          <img
            src={channel.thumbnail_url}
            alt={channel.name}
            className="h-7 w-7 rounded-full object-cover bg-muted"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : null}
        <h2 className="text-sm font-semibold">{channel.name}</h2>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading videos...</p>
      ) : (
        <div className="flex gap-4">
          <StreamPanel streams={streams} />
          <div className="min-w-0 flex-1">
            <VideoCarousel
              videos={regularVideos}
              maxItems={0}
              sortDirection={sortDir === 'asc' ? 'oldest' : 'newest'}
              density={density}
            />
          </div>
        </div>
      )}
    </section>
  )
}

function ChannelGroupedSection({
  channel,
  selectedMediaTypes,
  searchQuery,
  sortDir,
  density
}: {
  channel: YtChannel
  selectedMediaTypes: Set<MediaType>
  searchQuery: string
  sortDir: 'asc' | 'desc'
  density: CardDensity
}): React.ReactElement | null {
  const { videos, loading } = useYouTubeVideos(channel.channel_id)

  const filteredVideos = useMemo(() => {
    const base = filterVideos(videos, searchQuery, selectedMediaTypes)
    const sorted = [...base].sort((a, b) => a.published_at - b.published_at)
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [videos, searchQuery, selectedMediaTypes, sortDir])

  if (!loading && filteredVideos.length === 0) {
    return null
  }

  return (
    <section className="rounded-md border p-3">
      <div className="mb-3 flex items-center gap-2">
        {channel.thumbnail_url ? (
          <img
            src={channel.thumbnail_url}
            alt={channel.name}
            className="h-7 w-7 rounded-full object-cover bg-muted"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : null}
        <h2 className="text-sm font-semibold">{channel.name}</h2>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading videos...</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {filteredVideos.map((video) => (
            <VideoCard key={video.video_id} video={video} density={density} />
          ))}
        </div>
      )}
    </section>
  )
}

export default function YouTubePage(): React.ReactElement {
  const { channels, loading: loadingChannels } = useYouTubeChannels()
  const [viewMode, setViewMode] = useState<PageViewMode>('flat')
  const [densityByMode, setDensityByMode] = useState<DensityByMode>(DEFAULT_DENSITY_BY_MODE)
  const [syncing, setSyncing] = useState(false)

  const {
    videos,
    total,
    loading,
    error,
    refetch,
    channelId,
    setChannelId,
    mediaTypes,
    setMediaTypes,
    search,
    setSearch,
    sortDir,
    setSortDir,
    offset,
    setOffset
  } = useYouTubeVideosFiltered({
    limit: FLAT_PAGE_SIZE,
    sortDir: 'desc'
  })

  const enabledChannels = useMemo(
    () => channels.filter((channel) => channel.enabled === 1),
    [channels]
  )

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>()
    enabledChannels.forEach((channel) => {
      map.set(channel.channel_id, channel.name)
    })
    return map
  }, [enabledChannels])

  const selectedMediaTypeSet = useMemo(() => new Set(mediaTypes), [mediaTypes])

  const displayedChannels = useMemo(
    () => computeDisplayedChannels(enabledChannels, channelId),
    [enabledChannels, channelId]
  )

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, YOUTUBE_PAGE_VIEW_MODE_KEY)
      .then((saved) => {
        if (saved === 'flat' || saved === 'carousel' || saved === 'grouped') {
          setViewMode(saved)
        }
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, YOUTUBE_PAGE_DENSITY_KEY)
      .then((saved) => {
        if (typeof saved !== 'string' || saved.trim().length === 0) {
          return
        }

        const parsed = JSON.parse(saved) as Partial<DensityByMode>
        setDensityByMode({
          flat: parsed.flat === 'compact' ? 'compact' : 'detailed',
          carousel: parsed.carousel === 'compact' ? 'compact' : 'detailed',
          grouped: parsed.grouped === 'compact' ? 'compact' : 'detailed'
        })
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    window.api.invoke(IPC.SETTINGS_SET, YOUTUBE_PAGE_VIEW_MODE_KEY, viewMode).catch(console.error)
  }, [viewMode])

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_SET, YOUTUBE_PAGE_DENSITY_KEY, JSON.stringify(densityByMode))
      .catch(console.error)
  }, [densityByMode])

  const hasMore = offset + FLAT_PAGE_SIZE < total

  const handleSearchChange = (value: string): void => {
    setSearch(value)
    setOffset(0)
  }

  const handleChannelChange = (value: string): void => {
    setChannelId(value === '_all' ? null : value)
    setOffset(0)
  }

  const handleSortChange = (value: string): void => {
    setSortDir(value === 'asc' ? 'asc' : 'desc')
    setOffset(0)
  }

  const toggleMediaType = (mediaType: MediaType): void => {
    if (selectedMediaTypeSet.has(mediaType)) {
      setMediaTypes(mediaTypes.filter((item) => item !== mediaType))
    } else {
      setMediaTypes([...mediaTypes, mediaType])
    }
    setOffset(0)
  }

  const handleDensityChange = (value: string): void => {
    const nextDensity: CardDensity = value === 'compact' ? 'compact' : 'detailed'
    setDensityByMode((prev) => ({ ...prev, [viewMode]: nextDensity }))
  }

  const handleSync = async (): Promise<void> => {
    setSyncing(true)
    try {
      await window.api.invoke(IPC.YOUTUBE_POLL_NOW)
      await refetch()
    } catch (err) {
      console.error('YouTube sync failed', err)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex h-full flex-col px-6 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Youtube className="h-5 w-5 text-red-500" />
          YouTube
          {viewMode === 'flat' && total > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
          ) : null}
        </h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'flat' ? 'default' : 'ghost'}
              onClick={() => setViewMode('flat')}
            >
              Flat
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'carousel' ? 'default' : 'ghost'}
              onClick={() => setViewMode('carousel')}
            >
              Carousel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === 'grouped' ? 'default' : 'ghost'}
              onClick={() => setViewMode('grouped')}
            >
              Grouped
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => void handleSync()} disabled={syncing}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search videos..."
            className="h-9 pl-9"
          />
        </div>

        <Select value={channelId ?? '_all'} onValueChange={handleChannelChange}>
          <SelectTrigger className="h-9 w-[240px]">
            <SelectValue placeholder="All channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All channels</SelectItem>
            {enabledChannels.map((channel) => (
              <SelectItem key={channel.channel_id} value={channel.channel_id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortDir} onValueChange={handleSortChange}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest</SelectItem>
            <SelectItem value="asc">Oldest</SelectItem>
          </SelectContent>
        </Select>

        <Select value={densityByMode[viewMode]} onValueChange={handleDensityChange}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="detailed">Detailed</SelectItem>
            <SelectItem value="compact">Compact</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {MEDIA_TYPE_OPTIONS.map((option) => {
          const selected = selectedMediaTypeSet.has(option.id)
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={selected ? 'default' : 'outline'}
              onClick={() => toggleMediaType(option.id)}
            >
              {option.label}
            </Button>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto">
        {loadingChannels ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading channels...</p>
        ) : enabledChannels.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No channels configured.</p>
        ) : viewMode === 'flat' ? (
          <div>
            {loading && videos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading videos...</p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-red-500">{error}</p>
            ) : videos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No videos found.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-3">
                  {videos.map((video) => (
                    <VideoCard
                      key={video.video_id}
                      video={video}
                      density={densityByMode.flat}
                      channelName={channelNameById.get(video.channel_id) ?? undefined}
                    />
                  ))}
                </div>

                {hasMore ? (
                  <div className="py-4 text-center">
                    <Button variant="outline" onClick={() => setOffset(offset + FLAT_PAGE_SIZE)}>
                      Load More
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : viewMode === 'carousel' ? (
          <div className="space-y-3">
            {!loading && total === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No channels have videos matching your current filters.
              </p>
            ) : null}
            {displayedChannels.map((channel) => (
              <ChannelCarouselSection
                key={channel.channel_id}
                channel={channel}
                selectedMediaTypes={selectedMediaTypeSet}
                searchQuery={search}
                sortDir={sortDir}
                density={densityByMode.carousel}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {!loading && total === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No channels have videos matching your current filters.
              </p>
            ) : null}
            {displayedChannels.map((channel) => (
              <ChannelGroupedSection
                key={channel.channel_id}
                channel={channel}
                selectedMediaTypes={selectedMediaTypeSet}
                searchQuery={search}
                sortDir={sortDir}
                density={densityByMode.grouped}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
