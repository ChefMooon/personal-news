import React, { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { useTheme } from '../providers/ThemeProvider'
import { useYouTubeChannels } from '../hooks/useYouTubeChannels'
import { Eye, EyeOff } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'

function ApiKeysTab(): React.ReactElement {
  const [showKey, setShowKey] = useState(false)
  const [key, setKey] = useState('')

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-medium mb-1">YouTube Data API v3 Key</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Required for fetching video metadata. Get yours at console.cloud.google.com.
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? 'text' : 'password'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIzaSy..."
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            onClick={() => {
              console.log('[Settings] Save API key (no-op in prototype)')
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function YouTubeTab(): React.ReactElement {
  const { channels } = useYouTubeChannels()
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({})
  const [addInput, setAddInput] = useState('')

  const isEnabled = (channelId: string, defaultVal: number): boolean => {
    if (channelId in localEnabled) return localEnabled[channelId]
    return defaultVal === 1
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h3 className="text-sm font-medium mb-2">Configured Channels</h3>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels added yet.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.channel_id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {ch.thumbnail_url ? (
                    <img src={ch.thumbnail_url} alt="" className="w-7 h-7 rounded-full bg-muted" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{ch.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{ch.channel_id}</p>
                  </div>
                </div>
                <Switch
                  checked={isEnabled(ch.channel_id, ch.enabled)}
                  onCheckedChange={(checked) => {
                    // Update local state only — persistence not wired in prototype
                    setLocalEnabled((prev) => ({ ...prev, [ch.channel_id]: checked }))
                    console.log(`[Settings] Toggle channel ${ch.channel_id}: ${checked}`)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Add Channel</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Channel URL or ID..."
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() => {
              console.log('[Settings] Add channel (no-op in prototype):', addInput)
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

function AppearanceTab(): React.ReactElement {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-4 max-w-sm">
      <div>
        <h3 className="text-sm font-medium mb-1">Theme</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Choose the application color scheme.
        </p>
        <Select
          value={theme.id}
          onValueChange={(val) => {
            setTheme(val).catch(console.error)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System Default</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function PlaceholderTab({ name }: { name: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-center py-12">
      <p className="text-muted-foreground text-sm">{name} configuration coming soon.</p>
    </div>
  )
}

export default function Settings(): React.ReactElement {
  return (
    <div className="flex flex-col h-full px-6 py-4">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <Tabs defaultValue="api-keys" className="flex-1">
        <TabsList>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          <TabsTrigger value="reddit-digest">Reddit Digest</TabsTrigger>
          <TabsTrigger value="saved-posts">Saved Posts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
        </TabsList>
        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="youtube" className="mt-4">
          <YouTubeTab />
        </TabsContent>
        <TabsContent value="reddit-digest" className="mt-4">
          <PlaceholderTab name="Reddit Digest" />
        </TabsContent>
        <TabsContent value="saved-posts" className="mt-4">
          <PlaceholderTab name="Saved Posts" />
        </TabsContent>
        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
