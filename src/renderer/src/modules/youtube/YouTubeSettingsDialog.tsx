import React, { useEffect, useMemo, useState } from 'react'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { cn } from '../../lib/utils'

// ---- Sortable channel row ----

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
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Avatar */}
      {channel.thumbnail_url ? (
        <img
          src={channel.thumbnail_url}
          alt={`${channel.name} channel thumbnail`}
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

      {/* Name */}
      <span className={cn('text-sm flex-1 truncate min-w-0', !channel.enabled && 'opacity-50')}>
        {channel.name}
        {!channel.enabled && (
          <span className="ml-1 text-[10px] text-muted-foreground">(disabled)</span>
        )}
      </span>

      {/* Pin toggle */}
      <button
        type="button"
        onClick={onTogglePin}
        className={cn(
          'p-1 rounded transition-colors shrink-0',
          isPinned
            ? 'text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title={isPinned ? 'Unpin channel' : 'Pin to top'}
        aria-label={isPinned ? `Unpin ${channel.name}` : `Pin ${channel.name} to top`}
        aria-pressed={isPinned}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>

      {/* Select checkbox (only when mode is 'selected') */}
      {showSelect && (
        <button
          type="button"
          onClick={onToggleSelect}
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
            isSelected
              ? 'bg-primary border-primary'
              : 'border-input bg-background hover:border-primary/50'
          )}
          aria-label={isSelected ? 'Deselect channel' : 'Select channel'}
          aria-pressed={isSelected}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>
      )}
    </div>
  )
}

// ---- Setting row helper ----

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

// ---- Section header ----

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {title}
    </h3>
  )
}

// ---- Per-channel overrides section ----

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
        type="button"
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
                        alt={`${ch.name} channel thumbnail`}
                        className="w-5 h-5 rounded-full bg-muted shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-muted shrink-0" />
                    )}
                    <span className="text-sm font-medium truncate">{ch.name}</span>
                  </div>
                  <Switch
                    checked={hasOverride}
                    aria-label={hasOverride ? `Disable overrides for ${ch.name}` : `Enable overrides for ${ch.name}`}
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
                          aria-label={`${label} for ${ch.name}`}
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

// ---- Main dialog ----

interface YouTubeSettingsDialogProps {
  open: boolean
  onClose: () => void
  channels: YtChannel[]
  config: YouTubeViewConfig
  setConfig: (config: YouTubeViewConfig) => void
}

type MediaFilterKey = 'showVideos' | 'showShorts' | 'showLiveNow' | 'showUpcomingStreams' | 'showPastLivestreams'

const GLOBAL_MEDIA_FILTERS: { key: MediaFilterKey; label: string }[] = [
  { key: 'showVideos', label: 'Videos' },
  { key: 'showShorts', label: 'Shorts' },
  { key: 'showLiveNow', label: 'Live Now' },
  { key: 'showUpcomingStreams', label: 'Upcoming Streams' },
  { key: 'showPastLivestreams', label: 'Past Livestreams' }
]

export function YouTubeSettingsDialog({
  open,
  onClose,
  channels,
  config,
  setConfig
}: YouTubeSettingsDialogProps): React.ReactElement {
  const [draft, setDraft] = useState<YouTubeViewConfig>(config)

  // Reset draft to current config whenever the dialog opens
  useEffect(() => {
    if (open) setDraft(config)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Build an ordered channel list for the drag UI.
  // Start with channels in draft.channelOrder order, then append any not yet in the order.
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

  function handleChannelDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderedChannels.findIndex((c) => c.channel_id === active.id)
    const newIndex = orderedChannels.findIndex((c) => c.channel_id === over.id)
    const newOrder = arrayMove(orderedChannels, oldIndex, newIndex).map((c) => c.channel_id)
    setDraft((prev) => ({ ...prev, channelOrder: newOrder }))
  }

  function toggleChannelSelected(channelId: string): void {
    const selected = new Set(draft.selectedChannelIds)
    if (selected.has(channelId)) selected.delete(channelId)
    else selected.add(channelId)
    setDraft((prev) => ({ ...prev, selectedChannelIds: Array.from(selected) }))
  }

  function toggleChannelPinned(channelId: string): void {
    const pinned = new Set(draft.pinnedChannelIds)
    if (pinned.has(channelId)) pinned.delete(channelId)
    else pinned.add(channelId)
    setDraft((prev) => ({ ...prev, pinnedChannelIds: Array.from(pinned) }))
  }

  function handleSave(): void {
    setConfig(draft)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md flex flex-col max-h-[85vh] gap-0">
        <DialogHeader className="pb-4">
          <DialogTitle>YouTube Widget Settings</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 pl-6 pr-9 overflow-y-auto">
          <div className="space-y-5 pb-2">

            {/* CHANNELS */}
            <div>
              <SectionHeader title="Channels" />

              {/* Display mode toggle */}
              <div className="flex gap-2 mb-3">
                <Button
                  size="sm"
                  variant={draft.channelMode === 'all' ? 'default' : 'outline'}
                  onClick={() => setDraft((p) => ({ ...p, channelMode: 'all' }))}
                >
                  All Channels
                </Button>
                <Button
                  size="sm"
                  variant={draft.channelMode === 'selected' ? 'default' : 'outline'}
                  onClick={() => setDraft((p) => ({ ...p, channelMode: 'selected' }))}
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
                    onClick={() => setDraft((p) => ({ ...p, channelMode: 'selected', selectedChannelIds: channels.map((c) => c.channel_id) }))}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setDraft((p) => ({ ...p, channelMode: 'selected', selectedChannelIds: [] }))}
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {/* Channel list with drag reorder */}
              <div className="border rounded-md overflow-hidden">
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
                Drag to reorder · Pinned channels (
                <Pin className="inline h-3 w-3 text-amber-700 dark:text-amber-300" />) appear first
              </p>
            </div>

            <Separator />

            {/* CONTENT FILTERS */}
            <div>
              <SectionHeader title="Content Filters" />
              <div className="space-y-0.5">
                <SettingRow label="Hide watched videos">
                  <Switch
                    checked={draft.hideWatched}
                    aria-label="Hide watched videos"
                    onCheckedChange={(value) =>
                      setDraft((p) => ({ ...p, hideWatched: value }))
                    }
                  />
                </SettingRow>
                {GLOBAL_MEDIA_FILTERS.map(({ key, label }) => (
                  <SettingRow key={key} label={label}>
                    <Switch
                      checked={draft[key] as boolean}
                      aria-label={label}
                      onCheckedChange={(value) =>
                        setDraft((p) => ({ ...p, [key]: value }))
                      }
                    />
                  </SettingRow>
                ))}
              </div>
            </div>

            <Separator />

            {/* STREAM PANEL */}
            <div>
              <SectionHeader title="Stream Panel" />
              <SettingRow
                label="Show upcoming streams card"
                description="Side panel listing scheduled livestreams"
              >
                <Switch
                  checked={draft.showUpcomingPanel}
                  aria-label="Show upcoming streams card"
                  onCheckedChange={(v) => setDraft((p) => ({ ...p, showUpcomingPanel: v }))}
                />
              </SettingRow>
            </div>

            <Separator />

            {/* LAYOUT */}
            <div>
              <SectionHeader title="Layout" />
              <div className="space-y-0.5">
                <SettingRow label="Max videos per channel">
                  <Select
                    value={String(draft.maxVideosPerChannel)}
                    onValueChange={(v) =>
                      setDraft((p) => ({ ...p, maxVideosPerChannel: Number(v) }))
                    }
                  >
                    <SelectTrigger className="w-[80px] h-8 text-xs" aria-label="Max videos per channel">
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
                      setDraft((p) => ({ ...p, videoSortDirection: v as 'newest' | 'oldest' }))
                    }
                  >
                    <SelectTrigger className="w-[120px] h-8 text-xs" aria-label="Sort videos by">
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
                      setDraft((p) => ({ ...p, cardDensity: v as 'compact' | 'detailed' }))
                    }
                  >
                    <SelectTrigger className="w-[110px] h-8 text-xs" aria-label="Card density">
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
                    aria-label="Show channel headers"
                    onCheckedChange={(v) => setDraft((p) => ({ ...p, showChannelHeaders: v }))}
                  />
                </SettingRow>

                <SettingRow
                  label="Collapse channels by default"
                  description="Click the header to expand each channel"
                >
                  <Switch
                    checked={draft.collapseChannelsByDefault}
                    aria-label="Collapse channels by default"
                    onCheckedChange={(v) =>
                      setDraft((p) => ({ ...p, collapseChannelsByDefault: v }))
                    }
                  />
                </SettingRow>
              </div>
            </div>

            <Separator />

            {/* ADVANCED */}
            <div>
              <PerChannelOverrides
                channels={orderedChannels}
                overrides={draft.perChannelMediaOverrides}
                onChange={(overrides) =>
                  setDraft((p) => ({ ...p, perChannelMediaOverrides: overrides }))
                }
              />
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t mt-4 gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
