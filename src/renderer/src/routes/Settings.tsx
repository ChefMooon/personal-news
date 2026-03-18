import React, { useEffect, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { useTheme } from '../providers/ThemeProvider'
import { useYouTubeChannels } from '../hooks/useYouTubeChannels'
import { Eye, EyeOff } from 'lucide-react'
import { IPC, type IpcMutationResult, type YouTubeApiKeyStatus } from '../../../shared/ipc-types'
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
  const [status, setStatus] = useState<YouTubeApiKeyStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refreshStatus = (): void => {
    window.api
      .invoke(IPC.SETTINGS_GET_YOUTUBE_API_KEY_STATUS)
      .then((data) => {
        setStatus(data as YouTubeApiKeyStatus)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load API key status.')
      })
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const saveKey = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_YOUTUBE_API_KEY,
        key
      )) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to save API key.')
        return
      }
      setKey('')
      setMessage('API key saved and validated successfully.')
      refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key.')
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await window.api.invoke(IPC.SETTINGS_CLEAR_YOUTUBE_API_KEY)
      setKey('')
      setMessage('Saved API key removed.')
      refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear API key.')
    } finally {
      setSaving(false)
    }
  }

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
              void saveKey()
            }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={() => void clearKey()} disabled={saving}>
            Clear
          </Button>
        </div>
        {status?.isSet ? (
          <p className="text-xs text-muted-foreground mt-2">
            Saved key detected (ending in {status.suffix ?? 'n/a'}).
          </p>
        ) : null}
        {message ? <p className="text-xs text-emerald-600 mt-2">{message}</p> : null}
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
      </div>
    </div>
  )
}

function YouTubeTab(): React.ReactElement {
  const { channels } = useYouTubeChannels()
  const addInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingByChannel, setPendingByChannel] = useState<Record<string, boolean>>({})
  const [removingByChannel, setRemovingByChannel] = useState<Record<string, boolean>>({})
  const [addInput, setAddInput] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [intervalValue, setIntervalValue] = useState('15')
  const [savingInterval, setSavingInterval] = useState(false)
  const canSubmitChannel = addInput.trim().length > 0 && !adding

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'rss_poll_interval_minutes')
      .then((raw) => {
        if (typeof raw === 'string' && raw.trim()) {
          setIntervalValue(raw)
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load RSS poll interval.')
      })
  }, [])

  useEffect(() => {
    setPendingByChannel({})
  }, [channels])

  const isEnabled = (channelId: string, defaultVal: number): boolean => {
    if (channelId in pendingByChannel) return pendingByChannel[channelId]
    return defaultVal === 1
  }

  const setChannelEnabled = async (channelId: string, checked: boolean): Promise<void> => {
    setError(null)
    setMessage(null)
    setPendingByChannel((prev) => ({ ...prev, [channelId]: checked }))
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_SET_CHANNEL_ENABLED,
        channelId,
        checked
      )) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to update channel state.')
        setPendingByChannel((prev) => {
          const next = { ...prev }
          delete next[channelId]
          return next
        })
        return
      }
      setMessage('Channel setting saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel state.')
      setPendingByChannel((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
    }
  }

  const removeChannel = async (channelId: string, name: string): Promise<void> => {
    const confirmed = window.confirm(`Remove channel "${name}"?`)
    if (!confirmed) {
      return
    }

    setMessage(null)
    setError(null)
    setRemovingByChannel((prev) => ({ ...prev, [channelId]: true }))
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_REMOVE_CHANNEL,
        channelId
      )) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to remove channel.')
        return
      }
      setMessage('Channel removed successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove channel.')
    } finally {
      setRemovingByChannel((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
    }
  }

  const addChannel = async (): Promise<void> => {
    setAdding(true)
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_ADD_CHANNEL, addInput)) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to add channel.')
        return
      }
      setAddInput('')
      setMessage('Channel saved successfully.')
      addInputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add channel.')
    } finally {
      setAdding(false)
    }
  }

  const savePollInterval = async (): Promise<void> => {
    setSavingInterval(true)
    setMessage(null)
    setError(null)
    const parsed = Number.parseInt(intervalValue, 10)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_RSS_POLL_INTERVAL,
        parsed
      )) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to save RSS poll interval.')
        return
      }
      setMessage('RSS poll interval saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save RSS poll interval.')
    } finally {
      setSavingInterval(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h3 className="text-sm font-medium mb-2">RSS Poll Interval (minutes)</h3>
        <div className="flex gap-2 items-center">
          <Input
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            inputMode="numeric"
            className="w-40"
          />
          <Button variant="outline" onClick={() => void savePollInterval()} disabled={savingInterval}>
            {savingInterval ? 'Saving...' : 'Save Interval'}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Configured Channels</h3>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No channels added yet.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.channel_id} className="flex items-center justify-between py-2 border-b last:border-0 gap-3">
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
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isEnabled(ch.channel_id, ch.enabled)}
                    onCheckedChange={(checked) => {
                      void setChannelEnabled(ch.channel_id, checked)
                    }}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      void removeChannel(ch.channel_id, ch.name)
                    }}
                    disabled={Boolean(removingByChannel[ch.channel_id])}
                  >
                    {removingByChannel[ch.channel_id] ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Add Channel</h3>
        <div className="relative z-10 flex gap-2 pointer-events-auto">
          <Input
            ref={addInputRef}
            placeholder="Channel URL or ID..."
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                return
              }
              event.preventDefault()
              if (!canSubmitChannel) {
                return
              }
              void addChannel()
            }}
            className="pointer-events-auto"
          />
          <Button
            variant="outline"
            onClick={() => {
              void addChannel()
            }}
            disabled={!canSubmitChannel}
          >
            {adding ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </div>
      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
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
