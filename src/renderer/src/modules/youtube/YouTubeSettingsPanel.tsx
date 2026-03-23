import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Check, ChevronDown, ChevronRight, GripVertical, Pin } from 'lucide-react'
import type { ChannelMediaOverrides, YtChannel, YouTubeViewConfig } from '../../../../shared/ipc-types'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { ScrollArea } from '../../components/ui/scroll-area'
import { cn } from '../../lib/utils'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'

interface SortableChannelRowProps {
  channel: YtChannel
  showSelect: boolean
  isSelected: boolean
  isPinned: boolean
  onToggleSelect: () => void
  onTogglePin: () => void
}

function SortableChannelRow({
  channel,
  showSelect,
  isSelected,
  isPinned,
  onToggleSelect,
  onTogglePin
}: SortableChannelRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: channel.channel_id
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2 hover:bg-accent/40 border-b last:border-0"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {channel.thumbnail_url ? (
        <img
          src={channel.thumbnail_url}
          alt=""
          className="w-6 h-6 rounded-full bg-muted object-cover shrink-0"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
          <span className="text-[10px] text-muted-foreground">{channel.name[0]}</span>
        </div>
      )}

      <span className={cn('text-sm flex-1 truncate min-w-0', !channel.enabled && 'opacity-50')}>
        {channel.name}
        {!channel.enabled && (
          <span className="ml-1 text-[10px] text-muted-foreground">(disabled)</span>
        )}
      </span>

      <button
        onClick={onTogglePin}
        className={cn(
          'p-1 rounded transition-colors shrink-0',
          isPinned
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title={isPinned ? 'Unpin channel' : 'Pin to top'}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>

      {showSelect && (
        <button
          onClick={onToggleSelect}
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
            isSelected
              ? 'bg-primary border-primary'
              : 'border-input bg-background hover:border-primary/50'
          )}
          aria-label={isSelected ? 'Deselect channel' : 'Select channel'}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>
      )}
    </div>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 pr-1">{children}</div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {title}
    </h3>
  )
}

interface PerChannelOverridesProps {
  channels: YtChannel[]
  overrides: Record<string, Partial<ChannelMediaOverrides>>
  onChange: (overrides: Record<string, Partial<ChannelMediaOverrides>>) => void
}

const MEDIA_FIELDS: { key: keyof ChannelMediaOverrides; label: string }[] = [
  { key: 'showVideos', label: 'Videos' },
  { key: 'showShorts', label: 'Shorts' },
  { key: 'showLiveNow', label: 'Live Now' },
  { key: 'showUpcomingStreams', label: 'Upcoming Streams' },
  { key: 'showPastLivestreams', label: 'Past Livestreams' }
]

function PerChannelOverrides({
  channels,
  overrides,
  onChange
}: PerChannelOverridesProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  const setChannelOverride = (
    channelId: string,
    partial: Partial<ChannelMediaOverrides> | null
  ): void => {
    const next = { ...overrides }
    if (partial === null || Object.keys(partial).length === 0) {
      delete next[channelId]
    } else {
      next[channelId] = partial
    }
    onChange(next)
  }

  return (
    <div>
      <button
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded((p) => !p)}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Per-channel filter overrides
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 pl-1">
          {channels.length === 0 && (
            <p className="text-xs text-muted-foreground">No channels configured.</p>
          )}
          {channels.map((ch) => {
            const hasOverride = ch.channel_id in overrides
            const channelOverride = overrides[ch.channel_id] ?? {}

            return (
              <div key={ch.channel_id} className="border rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {ch.thumbnail_url ? (
                      <img
                        src={ch.thumbnail_url}
                        alt=""
                        className="w-5 h-5 rounded-full bg-muted shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{ch.name}</span>
                  </div>
                  <Switch
                    checked={hasOverride}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setChannelOverride(ch.channel_id, {
                          showVideos: true,
                          showShorts: true,
                          showLiveNow: true,
                          showUpcomingStreams: true,
                          showPastLivestreams: true
                        })
                      } else {
                        setChannelOverride(ch.channel_id, null)
                      }
                    }}
                  />
                </div>

                {hasOverride && (
                  <div className="px-3 py-2 space-y-1.5">
                    {MEDIA_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs">{label}</span>
                        <Switch
                          checked={channelOverride[key] ?? true}
                          onCheckedChange={(value) => {
                            setChannelOverride(ch.channel_id, { ...channelOverride, [key]: value })
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface YouTubeSettingsPanelProps {
  channels: YtChannel[]
  config: YouTubeViewConfig
  onChange: (config: YouTubeViewConfig) => void
}

type MediaFilterKey = 'showVideos' | 'showShorts' | 'showLiveNow' | 'showUpcomingStreams' | 'showPastLivestreams'

const GLOBAL_MEDIA_FILTERS: { key: MediaFilterKey; label: string }[] = [
  { key: 'showVideos', label: 'Videos' },
  { key: 'showShorts', label: 'Shorts' },
  { key: 'showLiveNow', label: 'Live Now' },
  { key: 'showUpcomingStreams', label: 'Upcoming Streams' },
  { key: 'showPastLivestreams', label: 'Past Livestreams' }
]

export function YouTubeSettingsPanel({
  channels,
  config,
  onChange
}: YouTubeSettingsPanelProps): React.ReactElement {
  const { instanceId } = useWidgetInstance()
  const [draft, setDraft] = useState<YouTubeViewConfig>(config)
  const [channelsExpanded, setChannelsExpanded] = useState(true)
  const [channelsExpandedLoaded, setChannelsExpandedLoaded] = useState(false)

  const channelsExpandedStorageKey = `youtube:settings:channelsExpanded:${instanceId}`

  useEffect(() => {
    setDraft(config)
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!instanceId) {
      setChannelsExpanded(true)
      setChannelsExpandedLoaded(true)
      return
    }

    try {
      const raw = window.localStorage.getItem(channelsExpandedStorageKey)
      if (raw === 'true' || raw === 'false') {
        setChannelsExpanded(raw === 'true')
      } else {
        setChannelsExpanded(true)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load YouTube channels panel state.')
      setChannelsExpanded(true)
    } finally {
      setChannelsExpandedLoaded(true)
    }
  }, [instanceId, channelsExpandedStorageKey])

  useEffect(() => {
    if (!channelsExpandedLoaded || !instanceId) return

    try {
      window.localStorage.setItem(channelsExpandedStorageKey, String(channelsExpanded))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save YouTube channels panel state.')
    }
  }, [channelsExpanded, channelsExpandedLoaded, instanceId, channelsExpandedStorageKey])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const orderedChannels = useMemo(() => {
    const channelMap = new Map(channels.map((c) => [c.channel_id, c]))
    const inOrder = draft.channelOrder
      .map((id) => channelMap.get(id))
      .filter((c): c is YtChannel => c !== undefined)
    const seen = new Set(draft.channelOrder)
    const rest = channels.filter((c) => !seen.has(c.channel_id))
    return [...inOrder, ...rest]
  }, [channels, draft.channelOrder])

  const visibleSelectedChannelIds = useMemo(
    () => draft.selectedChannelIds.filter((id) => channels.some((c) => c.channel_id === id)),
    [channels, draft.selectedChannelIds]
  )

  const selectedChannelCount =
    draft.channelMode === 'all' ? channels.length : visibleSelectedChannelIds.length

  const applyUpdate = (next: YouTubeViewConfig): void => {
    setDraft(next)
    onChange(next)
  }

  function handleChannelDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedChannels.findIndex((c) => c.channel_id === active.id)
    const newIndex = orderedChannels.findIndex((c) => c.channel_id === over.id)
    const newOrder = arrayMove(orderedChannels, oldIndex, newIndex).map((c) => c.channel_id)
    applyUpdate({ ...draft, channelOrder: newOrder })
  }

  function toggleChannelSelected(channelId: string): void {
    const selected = new Set(draft.selectedChannelIds)
    if (selected.has(channelId)) selected.delete(channelId)
    else selected.add(channelId)
    applyUpdate({ ...draft, selectedChannelIds: Array.from(selected) })
  }

  function toggleChannelPinned(channelId: string): void {
    const pinned = new Set(draft.pinnedChannelIds)
    if (pinned.has(channelId)) pinned.delete(channelId)
    else pinned.add(channelId)
    applyUpdate({ ...draft, pinnedChannelIds: Array.from(pinned) })
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="h-full">
        <div className="space-y-5 pb-2 pl-2 pr-4">

          <div>
            <button
              className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setChannelsExpanded((prev) => !prev)}
              aria-expanded={channelsExpanded}
              aria-controls="youtube-settings-channels"
            >
              {channelsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Channels
            </button>

            {channelsExpanded && (
              <div id="youtube-settings-channels">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant={draft.channelMode === 'all' ? 'default' : 'outline'}
                    onClick={() => applyUpdate({ ...draft, channelMode: 'all' })}
                  >
                    All Channels
                  </Button>
                  <Button
                    size="sm"
                    variant={draft.channelMode === 'selected' ? 'default' : 'outline'}
                    onClick={() => applyUpdate({ ...draft, channelMode: 'selected' })}
                  >
                    Selected Only
                  </Button>
                </div>

                <SectionHeader title="Selection" />
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs text-muted-foreground">
                    {selectedChannelCount} of {channels.length} shown
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => applyUpdate({ ...draft, channelMode: 'selected', selectedChannelIds: channels.map((c) => c.channel_id) })}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => applyUpdate({ ...draft, channelMode: 'selected', selectedChannelIds: [] })}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                <div
                  className="border rounded-md overflow-hidden"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {orderedChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">No channels configured.</p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleChannelDragEnd}
                    >
                      <SortableContext
                        items={orderedChannels.map((c) => c.channel_id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {orderedChannels.map((ch) => (
                          <SortableChannelRow
                            key={ch.channel_id}
                            channel={ch}
                            showSelect={draft.channelMode === 'selected'}
                            isSelected={draft.selectedChannelIds.includes(ch.channel_id)}
                            isPinned={draft.pinnedChannelIds.includes(ch.channel_id)}
                            onToggleSelect={() => toggleChannelSelected(ch.channel_id)}
                            onTogglePin={() => toggleChannelPinned(ch.channel_id)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Drag to reorder · Pinned channels appear first
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <SectionHeader title="Content Filters" />
            <div className="space-y-0.5">
              <SettingRow label="Hide watched videos">
                <Switch
                  checked={draft.hideWatched}
                  onCheckedChange={(value) => applyUpdate({ ...draft, hideWatched: value })}
                />
              </SettingRow>
              {GLOBAL_MEDIA_FILTERS.map(({ key, label }) => (
                <SettingRow key={key} label={label}>
                  <Switch
                    checked={draft[key] as boolean}
                    onCheckedChange={(value) => applyUpdate({ ...draft, [key]: value })}
                  />
                </SettingRow>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <SectionHeader title="Stream Panel" />
            <SettingRow
              label="Show upcoming streams card"
              description="Side panel listing scheduled livestreams"
            >
              <Switch
                checked={draft.showUpcomingPanel}
                onCheckedChange={(v) => applyUpdate({ ...draft, showUpcomingPanel: v })}
              />
            </SettingRow>
          </div>

          <Separator />

          <div>
            <SectionHeader title="Layout" />
            <div className="space-y-0.5">
              <SettingRow label="Max videos per channel">
                <Select
                  value={String(draft.maxVideosPerChannel)}
                  onValueChange={(v) =>
                    applyUpdate({ ...draft, maxVideosPerChannel: Number(v) })
                  }
                >
                  <SelectTrigger className="w-[80px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 25].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Sort videos by">
                <Select
                  value={draft.videoSortDirection}
                  onValueChange={(v) =>
                    applyUpdate({ ...draft, videoSortDirection: v as 'newest' | 'oldest' })
                  }
                >
                  <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Card density">
                <Select
                  value={draft.cardDensity}
                  onValueChange={(v) =>
                    applyUpdate({ ...draft, cardDensity: v as 'compact' | 'detailed' })
                  }
                >
                  <SelectTrigger className="w-[110px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="detailed">Detailed</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Show channel headers">
                <Switch
                  checked={draft.showChannelHeaders}
                  onCheckedChange={(v) => applyUpdate({ ...draft, showChannelHeaders: v })}
                />
              </SettingRow>

              <SettingRow
                label="Collapse channels by default"
                description="Click the header to expand each channel"
              >
                <Switch
                  checked={draft.collapseChannelsByDefault}
                  onCheckedChange={(v) =>
                    applyUpdate({ ...draft, collapseChannelsByDefault: v })
                  }
                />
              </SettingRow>
            </div>
          </div>

          <Separator />

          <div>
            <PerChannelOverrides
              channels={orderedChannels}
              overrides={draft.perChannelMediaOverrides}
              onChange={(overrides) =>
                applyUpdate({ ...draft, perChannelMediaOverrides: overrides })
              }
            />
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
