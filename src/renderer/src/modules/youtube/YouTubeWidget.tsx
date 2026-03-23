import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useYouTubeChannels } from '../../hooks/useYouTubeChannels'
import { useYouTubeViewConfig, DEFAULT_YOUTUBE_VIEW_CONFIG } from '../../hooks/useYouTubeViewConfig'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { ChannelRow } from './ChannelRow'
import { YouTubeSettingsPanel } from './YouTubeSettingsPanel'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { RefreshCcw, RotateCcw, Settings2, X, Youtube } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../../components/ui/alert-dialog'
import { registerRendererModule } from '../registry'
import type { YtChannel, YouTubeViewConfig } from '../../../../shared/ipc-types'

function computeDisplayedChannels(
  allChannels: YtChannel[],
  config: YouTubeViewConfig
): YtChannel[] {
  // 1. Enabled only
  let channels = allChannels.filter((c) => c.enabled)

  // 2. Selection filter
  if (config.channelMode === 'selected' && config.selectedChannelIds.length > 0) {
    const selectedSet = new Set(config.selectedChannelIds)
    channels = channels.filter((c) => selectedSet.has(c.channel_id))
  }

  // 3. Custom per-widget order
  if (config.channelOrder.length > 0) {
    const orderMap = new Map(config.channelOrder.map((id, idx) => [id, idx]))
    channels = [...channels].sort((a, b) => {
      const ai = orderMap.has(a.channel_id) ? orderMap.get(a.channel_id)! : Number.MAX_SAFE_INTEGER
      const bi = orderMap.has(b.channel_id) ? orderMap.get(b.channel_id)! : Number.MAX_SAFE_INTEGER
      return ai !== bi ? ai - bi : a.sort_order - b.sort_order
    })
  }

  // 4. Pinned channels to the top
  if (config.pinnedChannelIds.length > 0) {
    const pinnedSet = new Set(config.pinnedChannelIds)
    const pinned = channels.filter((c) => pinnedSet.has(c.channel_id))
    const unpinned = channels.filter((c) => !pinnedSet.has(c.channel_id))
    channels = [...pinned, ...unpinned]
  }

  return channels
}

function YouTubeWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance()
  const widgetTitle = label ?? 'YouTube'
  const { channels, loading } = useYouTubeChannels()
  const { config: viewConfig, setConfig } = useYouTubeViewConfig(instanceId)
  const [isEditing, setIsEditing] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<YouTubeViewConfig | null>(null)
  const [editContentHeight, setEditContentHeight] = useState<number | null>(null)
  const [collapsedChannels, setCollapsedChannels] = useState<Record<string, boolean>>({})
  const cardContentRef = useRef<HTMLDivElement | null>(null)

  // Reset per-channel collapse state when the default changes
  useEffect(() => {
    setCollapsedChannels({})
  }, [viewConfig.collapseChannelsByDefault])

  // Close on Escape key
  useEffect(() => {
    if (!isEditing) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  const displayedChannels = useMemo(
    () => computeDisplayedChannels(channels, viewConfig),
    [channels, viewConfig]
  )

  const isChannelCollapsed = (channelId: string): boolean => {
    if (channelId in collapsedChannels) return collapsedChannels[channelId]
    return viewConfig.collapseChannelsByDefault
  }

  const toggleCollapse = (channelId: string): void => {
    setCollapsedChannels((prev) => ({
      ...prev,
      [channelId]: !isChannelCollapsed(channelId)
    }))
  }

  const enabledCount = channels.filter((c) => c.enabled).length

  function handleOpenEdit(): void {
    const currentHeight = cardContentRef.current?.getBoundingClientRect().height
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight)
    }
    setSnapshotConfig(viewConfig)
    setIsEditing(true)
  }

  function handleClose(): void {
    setIsEditing(false)
    setSnapshotConfig(null)
    setEditContentHeight(null)
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig)
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_YOUTUBE_VIEW_CONFIG)
    setSnapshotConfig(DEFAULT_YOUTUBE_VIEW_CONFIG)
  }

  const channelList = (
    <>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading channels...</p>
      ) : displayedChannels.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {enabledCount === 0
            ? 'No channels configured.'
            : 'No channels selected. Open settings to choose channels.'}
        </p>
      ) : (
        <div>
          {displayedChannels.map((channel, idx) => (
            <div key={channel.channel_id}>
              {idx > 0 && <Separator className="my-1" />}
              <ChannelRow
                channel={channel}
                viewConfig={viewConfig}
                isCollapsed={isChannelCollapsed(channel.channel_id)}
                onToggleCollapse={() => toggleCollapse(channel.channel_id)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            {widgetTitle}
          </CardTitle>
          {isEditing ? (
            <div className="flex items-center gap-0.5">
              <button
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={handleReset}
                title="Reset to when you opened this"
                aria-label="Reset settings"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Restore defaults"
                    aria-label="Restore default settings"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reset all YouTube widget settings to their defaults? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFactoryReset}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <button
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={handleClose}
                title="Close settings"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="YouTube widget settings"
              onClick={handleOpenEdit}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        style={isEditing && editContentHeight ? { height: editContentHeight, overflow: 'hidden' } : undefined}
      >
        <div className={isEditing ? 'youtube-card-edit' : undefined}>
          <div className={isEditing ? 'youtube-card-edit__preview' : undefined}>{channelList}</div>
          {isEditing && (
            <div className="youtube-card-edit__panel">
              <YouTubeSettingsPanel
                channels={channels}
                config={viewConfig}
                onChange={setConfig}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Register this widget in the renderer module registry
registerRendererModule({
  id: 'youtube',
  displayName: 'YouTube',
  widget: YouTubeWidget
})

export default YouTubeWidget
