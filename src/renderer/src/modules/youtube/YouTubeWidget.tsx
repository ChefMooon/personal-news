import React, { useEffect, useMemo, useState } from 'react'
import { useYouTubeChannels } from '../../hooks/useYouTubeChannels'
import { useYouTubeViewConfig } from '../../hooks/useYouTubeViewConfig'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { ChannelRow } from './ChannelRow'
import { YouTubeSettingsDialog } from './YouTubeSettingsDialog'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { Settings2, Youtube } from 'lucide-react'
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
  const { instanceId } = useWidgetInstance()
  const { channels, loading } = useYouTubeChannels()
  const { config: viewConfig, setConfig } = useYouTubeViewConfig(instanceId)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [collapsedChannels, setCollapsedChannels] = useState<Record<string, boolean>>({})

  // Reset per-channel collapse state when the default changes
  useEffect(() => {
    setCollapsedChannels({})
  }, [viewConfig.collapseChannelsByDefault])

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

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Youtube className="h-5 w-5 text-red-500" />
              YouTube
            </CardTitle>
            <button
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="YouTube widget settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <YouTubeSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        channels={channels}
        config={viewConfig}
        setConfig={setConfig}
      />
    </>
  )
}

// Register this widget in the renderer module registry
registerRendererModule({
  id: 'youtube',
  displayName: 'YouTube',
  widget: YouTubeWidget
})

export default YouTubeWidget
