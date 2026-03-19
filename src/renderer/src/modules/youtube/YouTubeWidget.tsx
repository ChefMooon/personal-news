import React from 'react'
import { useYouTubeChannels } from '../../hooks/useYouTubeChannels'
import { useYouTubeViewConfig } from '../../hooks/useYouTubeViewConfig'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { ChannelRow } from './ChannelRow'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Separator } from '../../components/ui/separator'
import { Youtube } from 'lucide-react'
import { registerRendererModule } from '../registry'

function YouTubeWidget(): React.ReactElement {
  const { instanceId } = useWidgetInstance()
  const { channels, loading } = useYouTubeChannels()
  const { config: viewConfig } = useYouTubeViewConfig(instanceId)

  const enabledChannels = channels.filter((c) => c.enabled)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Youtube className="h-5 w-5 text-red-500" />
            YouTube
          </CardTitle>
          {/* Gear icon — no-op for now */}
          <button className="p-1 rounded text-muted-foreground hover:bg-accent" aria-label="YouTube settings (coming soon)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading channels...</p>
        ) : enabledChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels configured.</p>
        ) : (
          <div>
            {enabledChannels.map((channel, idx) => (
              <div key={channel.channel_id}>
                {idx > 0 && <Separator className="my-1" />}
                <ChannelRow channel={channel} viewConfig={viewConfig} />
              </div>
            ))}
          </div>
        )}
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
