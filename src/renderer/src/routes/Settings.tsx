import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { useTheme } from '../providers/ThemeProvider'
import { useYouTubeChannels } from '../hooks/useYouTubeChannels'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { Download, Eye, EyeOff, ExternalLink, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { ThemeCreatorDialog, readThemeTokensFromDocument } from '../components/ThemeCreatorDialog'
import {
  IPC,
  type IpcMutationResult,
  type ThemeImportResult,
  type YouTubeCacheClearResult,
  type YouTubeApiKeyStatus,
  type DigestWeekSummary,
  type NotificationPreferences,
  type ThemeRow,
  type UpdateStatusEvent
} from '../../../shared/ipc-types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { NtfyOnboardingWizard } from '../modules/saved-posts/NtfyOnboardingWizard'
import { TagManagementModal } from '../modules/saved-posts/TagManagementModal'

function YouTubeTab(): React.ReactElement {
  const { channels } = useYouTubeChannels()
  const addInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingByChannel, setPendingByChannel] = useState<Record<string, boolean>>({})
  const [removingByChannel, setRemovingByChannel] = useState<Record<string, boolean>>({})
  const [channelToRemove, setChannelToRemove] = useState<{ id: string; name: string } | null>(null)
  const [addInput, setAddInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [intervalValue, setIntervalValue] = useState('15')
  const [savingInterval, setSavingInterval] = useState(false)
  const [pollingNow, setPollingNow] = useState(false)
  const [clearingVideoCache, setClearingVideoCache] = useState(false)
  const canSubmitChannel = addInput.trim().length > 0 && !adding

  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<YouTubeApiKeyStatus | null>(null)
  const [savingKey, setSavingKey] = useState(false)

  const refreshApiKeyStatus = (): void => {
    window.api
      .invoke(IPC.SETTINGS_GET_YOUTUBE_API_KEY_STATUS)
      .then((data) => {
        setApiKeyStatus(data as YouTubeApiKeyStatus)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load API key status.')
      })
  }

  const saveApiKey = async (): Promise<void> => {
    setSavingKey(true)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_YOUTUBE_API_KEY,
        apiKey
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to save API key.')
        return
      }
      setApiKey('')
      toast.success('API key saved and validated successfully.')
      refreshApiKeyStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save API key.')
    } finally {
      setSavingKey(false)
    }
  }

  const clearApiKey = async (): Promise<void> => {
    setSavingKey(true)
    try {
      await window.api.invoke(IPC.SETTINGS_CLEAR_YOUTUBE_API_KEY)
      setApiKey('')
      toast.success('YouTube API key removed.')
      refreshApiKeyStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear API key.')
    } finally {
      setSavingKey(false)
    }
  }

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'rss_poll_interval_minutes')
      .then((raw) => {
        if (typeof raw === 'string' && raw.trim()) {
          setIntervalValue(raw)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load RSS poll interval.')
      })
  }, [])

  useEffect(() => {
    setPendingByChannel({})
  }, [channels])

  useEffect(() => {
    refreshApiKeyStatus()
  }, [])

  const isEnabled = (channelId: string, defaultVal: number): boolean => {
    if (channelId in pendingByChannel) return pendingByChannel[channelId]
    return defaultVal === 1
  }

  const setChannelEnabled = async (channelId: string, checked: boolean): Promise<void> => {
    setPendingByChannel((prev) => ({ ...prev, [channelId]: checked }))
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_SET_CHANNEL_ENABLED,
        channelId,
        checked
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update channel state.')
        setPendingByChannel((prev) => {
          const next = { ...prev }
          delete next[channelId]
          return next
        })
        return
      }
      toast.success('Channel settings saved.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update channel state.')
      setPendingByChannel((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
    }
  }

  const removeChannel = async (channelId: string): Promise<void> => {
    setRemovingByChannel((prev) => ({ ...prev, [channelId]: true }))
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_REMOVE_CHANNEL,
        channelId
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to remove channel.')
        return
      }
      toast.success('Channel removed successfully.')
      requestAnimationFrame(() => {
        addInputRef.current?.focus()
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove channel.')
    } finally {
      setRemovingByChannel((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
      setChannelToRemove((current) => (current?.id === channelId ? null : current))
    }
  }

  const addChannel = async (): Promise<void> => {
    setAdding(true)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_ADD_CHANNEL, addInput)) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to add channel.')
        return
      }
      setAddInput('')
      toast.success('Channel added successfully.')
      addInputRef.current?.focus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add channel.')
    } finally {
      setAdding(false)
    }
  }

  const savePollInterval = async (): Promise<void> => {
    setSavingInterval(true)
    const parsed = Number.parseInt(intervalValue, 10)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_RSS_POLL_INTERVAL,
        parsed
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to save RSS poll interval.')
        return
      }
      toast.success('RSS poll interval saved.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save RSS poll interval.')
    } finally {
      setSavingInterval(false)
    }
  }

  const pollNow = async (): Promise<void> => {
    setPollingNow(true)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_POLL_NOW)) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to run YouTube RSS poll.')
        return
      }
      toast.success('YouTube RSS poll completed.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to run YouTube RSS poll.')
    } finally {
      setPollingNow(false)
    }
  }

  const clearVideoCache = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Delete all cached YouTube videos? Channels will be kept and videos can be re-fetched on next poll.'
    )
    if (!confirmed) {
      return
    }

    setClearingVideoCache(true)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_CLEAR_VIDEOS_CACHE)) as YouTubeCacheClearResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to clear YouTube cache.')
        return
      }
      toast.success(`YouTube cache cleared. Removed ${result.deletedCount} video entries.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear YouTube cache.')
    } finally {
      setClearingVideoCache(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg">
      <AlertDialog
        open={channelToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setChannelToRemove(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove channel?</AlertDialogTitle>
            <AlertDialogDescription>
              {channelToRemove
                ? `This will remove "${channelToRemove.name}" from your configured channels.`
                : 'This will remove the selected channel from your configured channels.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(channelToRemove && removingByChannel[channelToRemove.id])}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(channelToRemove && removingByChannel[channelToRemove.id])}
              onClick={(event) => {
                if (!channelToRemove) {
                  event.preventDefault()
                  return
                }
                event.preventDefault()
                void removeChannel(channelToRemove.id)
              }}
            >
              {channelToRemove && removingByChannel[channelToRemove.id] ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div>
        <h3 className="text-sm font-medium mb-1">YouTube Data API v3 Key</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Required for fetching video metadata. Get yours at console.cloud.google.com.
        </p>
        <label htmlFor="youtube-api-key" className="text-xs text-muted-foreground mb-2 block">
          API key
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="youtube-api-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              aria-pressed={showKey}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button
            onClick={() => {
              void saveApiKey()
            }}
            disabled={savingKey}
          >
            {savingKey ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="outline" onClick={() => void clearApiKey()} disabled={savingKey}>
            Clear
          </Button>
        </div>
        {apiKeyStatus?.isSet ? (
          <p className="text-xs text-muted-foreground mt-2">
            Saved key detected (ending in {apiKeyStatus.suffix ?? 'n/a'}).
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">RSS Poll Interval (minutes)</h3>
        <div className="flex gap-2 items-center">
          <label htmlFor="youtube-rss-poll-interval" className="sr-only">YouTube RSS poll interval in minutes</label>
          <Input
            id="youtube-rss-poll-interval"
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
        <h3 className="text-sm font-medium mb-2">Cache Maintenance</h3>
        <Button variant="destructive" onClick={() => void clearVideoCache()} disabled={clearingVideoCache}>
          {clearingVideoCache ? 'Clearing Cache...' : 'Clear Cached YouTube Videos'}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          This removes rows from yt_videos only. Channels are preserved.
        </p>
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
                    <img src={ch.thumbnail_url} alt={`${ch.name} channel thumbnail`} className="w-7 h-7 rounded-full bg-muted" />
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
                    aria-label={`Enable channel ${ch.name}`}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setChannelToRemove({ id: ch.channel_id, name: ch.name })
                    }}
                    disabled={Boolean(removingByChannel[ch.channel_id])}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Add Channel</h3>
        <div className="flex gap-2">
          <label htmlFor="youtube-add-channel" className="sr-only">YouTube channel ID, handle, or URL</label>
          <Input
            id="youtube-add-channel"
            ref={addInputRef}
            placeholder="Channel ID, @handle, or full YouTube URL..."
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
            className="flex-1"
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

      <div>
        <h3 className="text-sm font-medium mb-2">YouTube Sync</h3>
        <Button variant="outline" onClick={() => void pollNow()} disabled={pollingNow}>
          {pollingNow ? 'Polling...' : 'Poll Now'}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Runs a YouTube poll immediately using the current channel list and API key.
        </p>
      </div>
    </div>
  )
}

function AppearanceTab(): React.ReactElement {
  const { theme, customThemes, refreshThemes, setTheme } = useTheme()
  const [createOpen, setCreateOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState<ThemeRow | null>(null)
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null)
  const [exportBusyId, setExportBusyId] = useState<string | null>(null)

  const openCreate = (): void => {
    setEditingTheme(null)
    setCreateOpen(true)
  }

  const openEdit = (row: ThemeRow): void => {
    setEditingTheme(row)
    setCreateOpen(true)
  }

  const removeTheme = async (row: ThemeRow): Promise<void> => {
    if (!window.confirm(`Delete the theme "${row.name}"?`)) {
      return
    }

    setDeleteBusyId(row.id)
    try {
      const result = (await window.api.invoke(IPC.THEMES_DELETE, row.id)) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to delete theme.')
        return
      }

      if (theme.id === row.id) {
        await setTheme('system')
      }

      await refreshThemes()
      toast.success('Theme deleted.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete theme.')
    } finally {
      setDeleteBusyId(null)
    }
  }

  const exportTheme = async (row: ThemeRow): Promise<void> => {
    setExportBusyId(row.id)
    try {
      const result = (await window.api.invoke(IPC.THEMES_EXPORT, row.id)) as IpcMutationResult
      if (!result.ok && result.error) {
        toast.error(result.error)
      } else if (result.ok) {
        toast.success(`Theme "${row.name}" exported.`)
      }
      // result.ok === false && result.error === null → user cancelled, no toast
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export theme.')
    } finally {
      setExportBusyId(null)
    }
  }

  const importTheme = async (): Promise<void> => {
    try {
      const result = (await window.api.invoke(IPC.THEMES_IMPORT)) as ThemeImportResult
      if (!result.ok && result.error) {
        toast.error(result.error)
      } else if (result.ok && result.theme) {
        await refreshThemes()
        toast.success(`Theme "${result.theme.name}" imported.`)
      }
      // result.ok === false && result.error === null → user cancelled, no toast
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import theme.')
    }
  }

  const initialTokens = readThemeTokensFromDocument()

  return (
    <div className="space-y-4 max-w-2xl">
      <ThemeCreatorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialTokens={initialTokens}
        editingTheme={editingTheme}
        onSaved={async () => {
          await refreshThemes()
        }}
      />

      <div>
        <h3 className="text-sm font-medium mb-1">Theme</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Choose the application color scheme.
        </p>
        <Select
          value={theme.id}
          onValueChange={(val) => {
            setTheme(val).catch((err) => {
              toast.error(err instanceof Error ? err.message : 'Failed to apply theme.')
            })
          }}
        >
          <SelectTrigger className="w-[200px]" aria-label="Theme selection">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System Default</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            {customThemes.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">Custom Themes</h3>
            <p className="text-xs text-muted-foreground">
              Create, edit, and delete custom themes backed by the local themes table.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { void importTheme() }}>
              <Download className="h-4 w-4" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New Theme
            </Button>
          </div>
        </div>

        {customThemes.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom themes yet.</p>
        ) : (
          <div className="space-y-2">
            {customThemes.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">{row.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label={`Edit theme ${row.name}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { void exportTheme(row) }}
                    aria-label={`Export theme ${row.name}`}
                    disabled={exportBusyId === row.id}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void removeTheme(row)
                    }}
                    aria-label={`Delete theme ${row.name}`}
                    disabled={deleteBusyId === row.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function normalizeSubredditInput(value: string): string | null {
  const normalized = value.trim().replace(/^r\//i, '').toLowerCase()
  if (!normalized) {
    return null
  }
  if (!/^[a-z0-9_]+$/i.test(normalized)) {
    return null
  }
  return normalized
}

function RedditDigestTab(): React.ReactElement {
  const [subreddits, setSubreddits] = useState<string[]>([])
  const [weekStart, setWeekStart] = useState<'0' | '1'>('1')
  const [weeks, setWeeks] = useState<DigestWeekSummary[]>([])
  const [keepWeeks, setKeepWeeks] = useState('4')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [pruning, setPruning] = useState(false)

  const load = (): void => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'reddit_digest_subreddits')
      .then((raw) => {
        if (typeof raw !== 'string' || raw.trim().length === 0) {
          setSubreddits([])
          return
        }
        try {
          const parsed = JSON.parse(raw) as unknown
          if (!Array.isArray(parsed)) {
            setSubreddits([])
            return
          }
          setSubreddits(
            parsed
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim().toLowerCase())
              .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
          )
        } catch {
          setSubreddits([])
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Reddit Digest settings.')
      })

    window.api
      .invoke(IPC.SETTINGS_GET, 'reddit_digest_week_start')
      .then((raw) => {
        setWeekStart(raw === '0' ? '0' : '1')
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Reddit Digest week start setting.')
      })

    window.api
      .invoke(IPC.REDDIT_GET_DIGEST_WEEKS)
      .then((data) => {
        setWeeks(data as DigestWeekSummary[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Reddit Digest records.')
      })
  }

  useEffect(() => {
    load()
  }, [])

  const persist = async (nextSubreddits: string[], successMessage: string): Promise<void> => {
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'reddit_digest_subreddits', JSON.stringify(nextSubreddits))
      setSubreddits(nextSubreddits)
      toast.success(successMessage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save Reddit Digest settings.')
    }
  }

  const addSubreddit = async (): Promise<void> => {
    const normalized = normalizeSubredditInput(draft)
    if (!normalized) {
      toast.error('Subreddits may contain letters, numbers, and underscores only.')
      return
    }
    if (subreddits.includes(normalized)) {
      toast.error(`r/${normalized} is already configured.`)
      return
    }

    setSaving(true)
    try {
      const validation = (await window.api.invoke(
        IPC.REDDIT_VALIDATE_DIGEST_SUBREDDIT,
        normalized
      )) as IpcMutationResult
      if (!validation.ok) {
        toast.error(validation.error ?? `r/${normalized} could not be added.`)
        return
      }

      const next = [...subreddits, normalized].sort()
      await persist(next, 'Subreddit added.')
      setDraft('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to validate subreddit.')
    } finally {
      setSaving(false)
    }
  }

  const removeSubreddit = async (subreddit: string): Promise<void> => {
    const next = subreddits.filter((value) => value !== subreddit)
    await persist(next, `Removed r/${subreddit}.`)
  }

  const saveWeekStart = async (nextWeekStart: '0' | '1'): Promise<void> => {
    setSaving(true)
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'reddit_digest_week_start', nextWeekStart)
      setWeekStart(nextWeekStart)
      toast.success('Week start preference saved. It will apply on the next Reddit Digest run.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save week start preference.')
    } finally {
      setSaving(false)
    }
  }

  const deleteWeek = async (weekStartDate: string): Promise<void> => {
    if (!window.confirm(`Delete all Reddit Digest posts for the week of ${weekStartDate}?`)) {
      return
    }

    setPruning(true)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_PRUNE_DIGEST_POSTS, {
        delete_week: weekStartDate
      })) as { ok: boolean; error: string | null; deletedCount: number }
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to delete Reddit Digest week.')
        return
      }
      load()
      toast.success(`Deleted ${result.deletedCount} posts for the week of ${weekStartDate}.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete Reddit Digest week.')
    } finally {
      setPruning(false)
    }
  }

  const pruneOldWeeks = async (): Promise<void> => {
    const parsed = Number.parseInt(keepWeeks, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      toast.error('Keep last N weeks must be at least 1.')
      return
    }
    if (!window.confirm(`Delete all Reddit Digest posts older than the most recent ${parsed} weeks?`)) {
      return
    }

    setPruning(true)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_PRUNE_DIGEST_POSTS, {
        keep_weeks: parsed
      })) as { ok: boolean; error: string | null; deletedCount: number }
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to prune Reddit Digest posts.')
        return
      }
      load()
      toast.success(
        result.deletedCount === 0
          ? 'No old Reddit Digest weeks needed pruning.'
          : `Pruned ${result.deletedCount} Reddit Digest posts.`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to prune Reddit Digest posts.')
    } finally {
      setPruning(false)
    }
  }

  return (
    <div className="space-y-4 max-w-lg pb-8">
      <div>
        <h3 className="text-sm font-medium mb-1">Week starts on</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Choose which day starts a new Reddit Digest week bucket. This takes effect on the next script run.
        </p>
        <div className="flex gap-2">
          <Button
            variant={weekStart === '0' ? 'default' : 'outline'}
            size="sm"
            onClick={() => void saveWeekStart('0')}
            disabled={saving}
          >
            Sunday
          </Button>
          <Button
            variant={weekStart === '1' ? 'default' : 'outline'}
            size="sm"
            onClick={() => void saveWeekStart('1')}
            disabled={saving}
          >
            Monday
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Tracked subreddits</h3>
        <p className="text-xs text-muted-foreground mb-3">
          The bundled Reddit Digest script will fetch top posts for these subreddits and ingest them into the dashboard.
        </p>
        <div className="flex gap-2">
          <label htmlFor="reddit-digest-add-subreddit" className="sr-only">Subreddit name</label>
          <Input
            id="reddit-digest-add-subreddit"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="programming"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                return
              }
              event.preventDefault()
              if (!draft.trim() || saving) {
                return
              }
              void addSubreddit()
            }}
          />
          <Button variant="outline" onClick={() => void addSubreddit()} disabled={saving || draft.trim().length === 0}>
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {subreddits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subreddits configured yet.</p>
        ) : (
          subreddits.map((subreddit) => (
            <div key={subreddit} className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">r/{subreddit}</span>
              <Button variant="ghost" size="sm" onClick={() => void removeSubreddit(subreddit)} disabled={saving}>
                Remove
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-md border bg-muted/20 px-3 py-3 text-xs text-muted-foreground space-y-1">
        <p>The first saved subreddit auto-registers the bundled Reddit Digest script in Script Manager with a weekly Monday 09:00 schedule.</p>
        <p>Use Script Manager to run it immediately, view live output, or adjust the schedule.</p>
      </div>

      <div className="pt-6 border-t space-y-3">
        <div>
          <h3 className="text-sm font-medium mb-1">Records Management</h3>
          <p className="text-xs text-muted-foreground">
            Browse and prune stored weekly Reddit Digest snapshots.
          </p>
        </div>

        <div className="space-y-2">
          {weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No weekly digest records yet.</p>
          ) : (
            weeks.map((week) => (
              <div key={week.week_start_date} className="flex items-center justify-between rounded-md border px-3 py-2 gap-3">
                <div>
                  <p className="text-sm font-medium">Week of {week.week_start_date}</p>
                  <p className="text-xs text-muted-foreground">{week.post_count} post{week.post_count === 1 ? '' : 's'}</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void deleteWeek(week.week_start_date)}
                  disabled={pruning}
                >
                  Delete
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="rounded-md border px-3 py-3 space-y-3">
          <div>
            <h4 className="text-sm font-medium mb-1">Prune old weeks</h4>
            <p className="text-xs text-muted-foreground">
              Keep the most recent N weekly snapshots and delete anything older.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <label htmlFor="reddit-digest-keep-weeks" className="sr-only">Number of most recent weeks to keep</label>
            <Input
              id="reddit-digest-keep-weeks"
              value={keepWeeks}
              onChange={(e) => setKeepWeeks(e.target.value)}
              inputMode="numeric"
              className="w-28"
            />
            <Button variant="outline" onClick={() => void pruneOldWeeks()} disabled={pruning}>
              {pruning ? 'Pruning...' : 'Keep Last N Weeks'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturesTab(): React.ReactElement {
  const { enabled, setEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled, setEnabled: setSavedPostsEnabled } = useSavedPostsEnabled()

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h3 className="text-sm font-medium mb-1">Reddit Digest</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Enable or disable the Reddit Digest feature. When disabled, the dashboard widget,
          dedicated page, and associated scripts are hidden.
        </p>
        <div className="flex items-center justify-between rounded-md border px-3 py-2 max-w-sm">
          <span className="text-sm">Enable Reddit Digest</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable Reddit Digest" />
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-1">Saved Posts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Enable or disable the Saved Posts feature. When disabled, the dashboard widget,
          dedicated page, and settings tab are hidden.
        </p>
        <div className="flex items-center justify-between rounded-md border px-3 py-2 max-w-sm">
          <span className="text-sm">Enable Saved Posts</span>
          <Switch checked={savedPostsEnabled} onCheckedChange={setSavedPostsEnabled} aria-label="Enable Saved Posts" />
        </div>
      </div>
    </div>
  )
}

function AppBehaviorTab(): React.ReactElement {
  const [closeToTray, setCloseToTray] = useState(true)
  const [startMinimized, setStartMinimized] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(false)
  const [launchAtLogin, setLaunchAtLogin] = useState(false)
  const [restoreWindowBounds, setRestoreWindowBounds] = useState(true)
  const [startMaximized, setStartMaximized] = useState(false)
  const [autoUpdateCheckEnabled, setAutoUpdateCheckEnabled] = useState(true)
  const [updatesSupported, setUpdatesSupported] = useState(true)
  const [resettingWindowLayout, setResettingWindowLayout] = useState(false)
  const [checkingForUpdates, setCheckingForUpdates] = useState(false)
  const [lastUpdateCheckOutcome, setLastUpdateCheckOutcome] = useState<string | null>(null)
  const [lastUpdateCheckAt, setLastUpdateCheckAt] = useState<number | null>(null)

  const getUpdateOutcomeLabel = (status: UpdateStatusEvent): string | null => {
    if (status.state === 'not-available') {
      return `Up to date (${status.currentVersion})`
    }

    if (status.state === 'available' || status.state === 'downloaded') {
      return status.version ? `Update ${status.version} available` : 'Update available'
    }

    if (status.state === 'error') {
      return status.friendlyMessage || status.message || 'Update check failed.'
    }

    if (status.state === 'disabled') {
      return status.message || 'Update checks are disabled.'
    }

    return null
  }

  const applyUpdateStatus = (status: UpdateStatusEvent): void => {
    setUpdatesSupported(status.supported)
    const outcome = getUpdateOutcomeLabel(status)
    if (!outcome) {
      return
    }
    setLastUpdateCheckOutcome(outcome)
    setLastUpdateCheckAt(Date.now())
  }

  useEffect(() => {
    const loadFlag = (key: string, setter: (value: boolean) => void, fallback: boolean): void => {
      window.api
        .invoke(IPC.SETTINGS_GET, key)
        .then((raw) => {
          if (typeof raw !== 'string') {
            setter(fallback)
            return
          }
          setter(raw === '1' || raw === 'true')
        })
        .catch((err) => {
          setter(fallback)
          toast.error(err instanceof Error ? err.message : `Failed to load ${key} setting.`)
        })
    }

    loadFlag('app_close_to_tray', setCloseToTray, true)
    loadFlag('app_start_minimized', setStartMinimized, false)
    loadFlag('app_minimize_to_tray', setMinimizeToTray, false)
    loadFlag('app_launch_at_login', setLaunchAtLogin, false)
    loadFlag('app_restore_window_bounds', setRestoreWindowBounds, true)
    loadFlag('app_start_maximized', setStartMaximized, false)
    loadFlag('app_auto_update_check_enabled', setAutoUpdateCheckEnabled, true)

    window.api
      .invoke(IPC.UPDATES_GET_STATUS)
      .then((status) => {
        applyUpdateStatus(status as UpdateStatusEvent)
      })
      .catch(() => {
      })

    return window.api.on(IPC.UPDATES_STATUS, (event) => {
      applyUpdateStatus(event as UpdateStatusEvent)
    })
  }, [])

  const saveFlag = async (
    key: string,
    value: boolean,
    setter: (value: boolean) => void,
    label: string
  ): Promise<void> => {
    const previous =
      key === 'app_close_to_tray'
        ? closeToTray
        : key === 'app_start_minimized'
          ? startMinimized
          : key === 'app_minimize_to_tray'
            ? minimizeToTray
          : key === 'app_launch_at_login'
            ? launchAtLogin
            : key === 'app_restore_window_bounds'
              ? restoreWindowBounds
              : key === 'app_auto_update_check_enabled'
                ? autoUpdateCheckEnabled
              : startMaximized

    setter(value)
    try {
      await window.api.invoke(IPC.SETTINGS_SET, key, value ? '1' : '0')
      toast.success(`${label} updated.`)
    } catch (err) {
      setter(previous)
      toast.error(err instanceof Error ? err.message : `Failed to save ${label.toLowerCase()}.`)
    }
  }

  const resetWindowLayout = async (): Promise<void> => {
    setResettingWindowLayout(true)
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'app_window_bounds', '')
      toast.success('Window layout reset. Default size and position will apply on next launch.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset window layout.')
    } finally {
      setResettingWindowLayout(false)
    }
  }

  const runManualUpdateCheck = async (): Promise<void> => {
    setCheckingForUpdates(true)
    try {
      const result = (await window.api.invoke(IPC.UPDATES_CHECK_FOR_UPDATES)) as IpcMutationResult
      if (!result.ok) {
        // Global update-status listener in App handles user-facing updater errors.
        return
      }
      toast.info('Checking for updates...')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check for updates.')
    } finally {
      setCheckingForUpdates(false)
    }
  }

  const lastUpdateCheckAtLabel =
    lastUpdateCheckAt !== null
      ? new Date(lastUpdateCheckAt).toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      : null

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h3 className="text-sm font-medium mb-1">General</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Core startup and window state preferences.
        </p>
        <div className="space-y-2 max-w-md">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Restore last window size and position</p>
              <p className="text-xs text-muted-foreground">Reopens where you left off on your last session.</p>
            </div>
            <Switch
              checked={restoreWindowBounds}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_restore_window_bounds',
                  checked,
                  setRestoreWindowBounds,
                  'Window restore behavior'
                )
              }}
              aria-label="Restore last window size and position"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Start app minimized</p>
              <p className="text-xs text-muted-foreground">Useful when launching automatically at sign-in.</p>
            </div>
            <Switch
              checked={startMinimized}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_start_minimized',
                  checked,
                  setStartMinimized,
                  'Start minimized behavior'
                )
              }}
              aria-label="Start app minimized"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Launch at login</p>
              <p className="text-xs text-muted-foreground">Starts Personal News when you sign in.</p>
            </div>
            <Switch
              checked={launchAtLogin}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_launch_at_login',
                  checked,
                  setLaunchAtLogin,
                  'Launch-at-login behavior'
                )
              }}
              aria-label="Launch at login"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Reset window layout</p>
              <p className="text-xs text-muted-foreground">Clears saved size and position. Applies next app launch.</p>
            </div>
            <Button variant="outline" onClick={() => void resetWindowLayout()} disabled={resettingWindowLayout}>
              {resettingWindowLayout ? 'Resetting...' : 'Reset'}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Updates</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Windows auto-update controls. Manual checks are always available.
        </p>
        <div className="space-y-2 max-w-md">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Automatically check for updates on startup</p>
              <p className="text-xs text-muted-foreground">
                When off, startup checks are skipped. You can still check manually.
              </p>
            </div>
            <Switch
              checked={autoUpdateCheckEnabled}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_auto_update_check_enabled',
                  checked,
                  setAutoUpdateCheckEnabled,
                  'Auto-update startup checks'
                )
              }}
              aria-label="Automatically check for updates on startup"
              disabled={!updatesSupported}
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Check for updates now</p>
              <p className="text-xs text-muted-foreground">
                Runs an immediate update check against the GitHub Releases feed.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void runManualUpdateCheck()
              }}
              disabled={!updatesSupported || checkingForUpdates}
            >
              {checkingForUpdates ? 'Checking...' : 'Check now'}
            </Button>
          </div>

          <div className="rounded-md border px-3 py-2">
            <p className="text-sm">Last update check</p>
            <p className="text-xs text-muted-foreground">
              {lastUpdateCheckOutcome ?? 'No completed checks yet in this session.'}
            </p>
            {lastUpdateCheckAtLabel ? (
              <p className="text-xs text-muted-foreground">Updated: {lastUpdateCheckAtLabel}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Tray Behavior</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Control whether the app hides instead of closing to keep background polling active.
        </p>
        <div className="space-y-2 max-w-md">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Hide to tray when closing window</p>
              <p className="text-xs text-muted-foreground">Keeps background polling active after clicking X.</p>
            </div>
            <Switch
              checked={closeToTray}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_close_to_tray',
                  checked,
                  setCloseToTray,
                  'Close-to-tray behavior'
                )
              }}
              aria-label="Hide to tray when closing window"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Hide to tray when minimizing</p>
              <p className="text-xs text-muted-foreground">Prevents a taskbar window while the app runs in background.</p>
            </div>
            <Switch
              checked={minimizeToTray}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_minimize_to_tray',
                  checked,
                  setMinimizeToTray,
                  'Minimize-to-tray behavior'
                )
              }}
              aria-label="Hide to tray when minimizing"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Window Behavior</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Configure how the main window opens each time the app starts.
        </p>
        <div className="space-y-2 max-w-md">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Start maximized</p>
              <p className="text-xs text-muted-foreground">Open the app in a maximized window.</p>
            </div>
            <Switch
              checked={startMaximized}
              onCheckedChange={(checked) => {
                void saveFlag(
                  'app_start_maximized',
                  checked,
                  setStartMaximized,
                  'Start maximized behavior'
                )
              }}
              aria-label="Start maximized"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ScriptsTab(): React.ReactElement {
  const [dir, setDir] = useState('')

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'script_home_dir')
      .then((v) => { setDir(typeof v === 'string' ? v : '') })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load script home directory.')
      })
  }, [])

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-medium mb-1">Script Home Directory</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Base directory shown when opening the scripts folder.
        </p>
        <div className="flex gap-2">
          <label htmlFor="script-home-directory" className="sr-only">Script home directory</label>
          <Input
            id="script-home-directory"
            value={dir}
            readOnly
            placeholder="No folder selected"
            className="flex-1"
          />
          <Button
            onClick={async () => {
              const picked = await window.api.invoke(IPC.DIALOG_SHOW_OPEN_FOLDER) as string | null
              if (picked === null) return
              try {
                await window.api.invoke(IPC.SETTINGS_SET, 'script_home_dir', picked)
                setDir(picked)
                toast.success('Script home directory saved.')
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Failed to save script home directory.')
              }
            }}
          >
            Browse
          </Button>
        </div>
      </div>
    </div>
  )
}

function SavedPostsTab(): React.ReactElement {
  const [intervalValue, setIntervalValue] = useState('60')
  const [savingInterval, setSavingInterval] = useState(false)
  const [topicConfigured, setTopicConfigured] = useState(false)
  const [topic, setTopic] = useState('')
  const [server, setServer] = useState('')
  const [lastPolled, setLastPolled] = useState<number | null>(null)
  const [isStale, setIsStale] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)

  const loadStatus = (): void => {
    window.api
      .invoke(IPC.REDDIT_GET_NTFY_STALENESS)
      .then((result) => {
        const s = result as { topicConfigured: boolean; lastPolledAt: number | null; isStale: boolean }
        setTopicConfigured(s.topicConfigured)
        setLastPolled(s.lastPolledAt)
        setIsStale(s.isStale)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load ntfy status.')
      })
    window.api
      .invoke(IPC.SETTINGS_GET, 'ntfy_poll_interval_minutes')
      .then((v) => {
        if (typeof v === 'string' && v.trim()) {
          setIntervalValue(v)
          return
        }
        setIntervalValue('60')
      })
      .catch(() => {
        setIntervalValue('60')
      })
    window.api
      .invoke(IPC.SETTINGS_GET, 'ntfy_topic')
      .then((v) => setTopic((v as string) || ''))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load ntfy topic.')
      })
    window.api
      .invoke(IPC.SETTINGS_GET, 'ntfy_server_url')
      .then((v) => setServer((v as string) || 'https://ntfy.sh'))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load ntfy server URL.')
      })
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_POLL_NTFY)) as { postsIngested: number }
      toast.success(`Connected. ${result.postsIngested} messages received.`)
      loadStatus()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reach the ntfy server.')
    } finally {
      setTesting(false)
    }
  }

  const savePollInterval = async (): Promise<void> => {
    setSavingInterval(true)
    const parsed = Number.parseInt(intervalValue, 10)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_NTFY_POLL_INTERVAL,
        parsed
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to save ntfy poll interval.')
        return
      }
      toast.success('Saved ntfy poll interval.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save ntfy poll interval.')
    } finally {
      setSavingInterval(false)
    }
  }

  if (!topicConfigured) {
    return (
      <div className="space-y-4 max-w-md">
        <h3 className="text-sm font-medium">Set Up Mobile Post Saving</h3>
        <p className="text-xs text-muted-foreground">
          Save Reddit posts from your phone using ntfy.sh, a free push notification service.
          Personal News will automatically sync saved posts when you open it.
        </p>
        <Button onClick={() => setShowWizard(true)}>Set Up</Button>
        <NtfyOnboardingWizard
          isOpen={showWizard}
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false)
            loadStatus()
          }}
        />
      </div>
    )
  }

  const lastPolledText = lastPolled
    ? new Date(lastPolled * 1000).toLocaleString()
    : 'Never'

  return (
    <div className="space-y-4 max-w-md">
      <div>
        <h3 className="text-sm font-medium mb-2">Sync Poll Interval (minutes)</h3>
        <div className="flex gap-2 items-center">
          <label htmlFor="saved-posts-poll-interval" className="sr-only">Saved Posts sync poll interval in minutes</label>
          <Input
            id="saved-posts-poll-interval"
            value={intervalValue}
            onChange={(e) => setIntervalValue(e.target.value)}
            inputMode="numeric"
            className="w-40"
          />
          <Button variant="outline" size="sm" onClick={() => void savePollInterval()} disabled={savingInterval}>
            {savingInterval ? 'Saving...' : 'Save Interval'}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">ntfy.sh Configuration</h3>
        <div className="space-y-1 text-sm">
          <p className="flex items-center gap-1">
            <span className="text-muted-foreground">Topic:</span>{' '}
            <button
              type="button"
              className="font-mono underline underline-offset-2 decoration-muted-foreground/50 hover:text-primary transition-colors inline-flex items-center gap-1"
              onClick={() => {
                const base = server.replace(/\/+$/, '')
                window.api.invoke('shell:openExternal', `${base}/${topic}`).catch((err) => {
                  toast.error(err instanceof Error ? err.message : 'Failed to open ntfy topic URL.')
                })
              }}
              aria-label="Open ntfy topic URL"
            >
              {topic}
              <ExternalLink className="h-3 w-3" />
            </button>
          </p>
          <p>
            <span className="text-muted-foreground">Server:</span>{' '}
            <span className="text-muted-foreground font-mono">{server}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Last synced:</span>{' '}
            <span className={isStale ? 'text-amber-700 dark:text-amber-300 font-medium' : ''}>
              {lastPolledText}
            </span>
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={testing}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowWizard(true)}>
          Edit
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowGuide(true)}>
          Mobile Setup Guide
        </Button>
      </div>
      <NtfyOnboardingWizard
        isOpen={showWizard || showGuide}
        onClose={() => {
          setShowWizard(false)
          setShowGuide(false)
        }}
        onComplete={() => {
          setShowWizard(false)
          setShowGuide(false)
          loadStatus()
        }}
        initialTopic={topic}
        initialServerUrl={server}
      />

      <div className="pt-6 border-t">
        <h3 className="text-sm font-medium mb-1">Tag Management</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Rename or delete tags across all saved posts.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowTagManager(true)}>
          Manage Tags
        </Button>
        <TagManagementModal
          isOpen={showTagManager}
          onClose={() => setShowTagManager(false)}
          onTagUpdated={() => {}}
        />
      </div>

      <div className="pt-6 border-t">
        <h3 className="text-sm font-medium mb-1">Danger Zone</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Permanently delete all saved posts from the local database. This cannot be undone.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowClearConfirm(true)}
          disabled={clearing}
        >
          {clearing ? 'Clearing...' : 'Clear Saved Posts Database'}
        </Button>
      </div>

      <AlertDialog open={showClearConfirm} onOpenChange={(open) => !open && setShowClearConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all saved posts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all saved posts from the local database. Tags, notes,
              and post data will be lost. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={(e) => {
                e.preventDefault()
                setClearing(true)
                window.api
                  .invoke(IPC.REDDIT_CLEAR_SAVED_POSTS)
                  .then((result) => {
                    const r = result as { deletedCount: number }
                    toast.success(`Cleared ${r.deletedCount} Saved Posts entries.`)
                  })
                  .catch((err) => {
                    toast.error(err instanceof Error ? err.message : 'Failed to clear database.')
                  })
                  .finally(() => {
                    setClearing(false)
                    setShowClearConfirm(false)
                  })
              }}
            >
              {clearing ? 'Clearing...' : 'Clear All Posts'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function NotifyRow({
  label,
  description,
  checked,
  onCheckedChange
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="mt-0.5 flex-shrink-0"
        aria-label={label}
      />
    </div>
  )
}

function NotificationsTab(): React.ReactElement {
  const [prefs, setPrefs] = React.useState<NotificationPreferences | null>(null)
  const { channels } = useYouTubeChannels()
  const [channelNotifyPending, setChannelNotifyPending] = React.useState<
    Record<string, { newVideos?: boolean; liveStart?: boolean }>
  >({})

  React.useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET_NOTIFICATION_PREFS)
      .then((data) => setPrefs(data as NotificationPreferences))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load notification settings.')
      })
  }, [])

  const updatePrefs = async (
    updater: (draft: NotificationPreferences) => NotificationPreferences
  ): Promise<void> => {
    if (!prefs) return
    const next = updater(prefs)
    setPrefs(next)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_NOTIFICATION_PREFS,
        next
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to save notification settings.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save notification settings.')
    }
  }

  const setChannelNotify = async (
    channelId: string,
    notifyNewVideos: boolean,
    notifyLiveStart: boolean
  ): Promise<void> => {
    setChannelNotifyPending((prev) => ({
      ...prev,
      [channelId]: { newVideos: notifyNewVideos, liveStart: notifyLiveStart }
    }))
    try {
      const result = (await window.api.invoke(
        IPC.YOUTUBE_SET_CHANNEL_NOTIFY,
        channelId,
        notifyNewVideos,
        notifyLiveStart
      )) as IpcMutationResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update channel notification setting.')
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update channel notification setting.'
      )
    } finally {
      setChannelNotifyPending((prev) => {
        const next = { ...prev }
        delete next[channelId]
        return next
      })
    }
  }

  if (!prefs) {
    return <p className="text-sm text-muted-foreground">Loading notification settings...</p>
  }

  return (
    <div className="space-y-6 max-w-lg pb-8">
      {/* ── Global ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 rounded-md border px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">Enable Desktop Notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Master switch. When off, no desktop notifications are shown regardless of per-category
            settings. Notifications only appear when the app window is not focused.
          </p>
        </div>
        <Switch
          checked={prefs.desktopNotificationsEnabled}
          onCheckedChange={(checked) =>
            void updatePrefs((p) => ({ ...p, desktopNotificationsEnabled: checked }))
          }
          className="mt-0.5 flex-shrink-0"
          aria-label="Enable desktop notifications"
        />
      </div>

      <div
        className={!prefs.desktopNotificationsEnabled ? 'opacity-50 pointer-events-none' : undefined}
      >
        {/* ── YouTube ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">YouTube</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control which YouTube activity triggers desktop notifications. Per-channel overrides
              are listed below the global category toggles.
            </p>
          </div>
          <NotifyRow
            label="New video available"
            description="Notify when a new video is detected for a subscribed channel during an RSS poll. Multiple new videos in one poll are grouped into a single notification."
            checked={prefs.youtube.newVideo}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({ ...p, youtube: { ...p.youtube, newVideo: checked } }))
            }
          />
          <NotifyRow
            label="Live stream started"
            description="Notify when a subscribed channel's video transitions from Upcoming to Live. Fires one notification per live-start event."
            checked={prefs.youtube.liveStart}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({ ...p, youtube: { ...p.youtube, liveStart: checked } }))
            }
          />

          {channels.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Per-channel notification overrides
              </h4>
              <div className="rounded-md border overflow-hidden">
                <div className="grid grid-cols-[1fr_6rem_6rem] px-3 py-1.5 text-xs text-muted-foreground border-b">
                  <span>Channel</span>
                  <span className="text-center">New videos</span>
                  <span className="text-center">Live starts</span>
                </div>
                {channels.map((ch) => {
                  const pending = channelNotifyPending[ch.channel_id]
                  const notifyNew = pending?.newVideos ?? ch.notify_new_videos === 1
                  const notifyLive = pending?.liveStart ?? ch.notify_live_start === 1
                  return (
                    <div
                      key={ch.channel_id}
                      className="grid grid-cols-[1fr_6rem_6rem] px-3 py-2 items-center border-b last:border-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {ch.thumbnail_url ? (
                          <img
                            src={ch.thumbnail_url}
                            alt={`${ch.name} channel thumbnail`}
                            className="w-6 h-6 rounded-full bg-muted flex-shrink-0"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-muted flex-shrink-0" />
                        )}
                        <span className="text-sm truncate">{ch.name}</span>
                      </div>
                      <div className="flex justify-center">
                        <Switch
                          checked={notifyNew}
                          onCheckedChange={(checked) =>
                            void setChannelNotify(ch.channel_id, checked, notifyLive)
                          }
                          aria-label={`Notify new videos for ${ch.name}`}
                        />
                      </div>
                      <div className="flex justify-center">
                        <Switch
                          checked={notifyLive}
                          onCheckedChange={(checked) =>
                            void setChannelNotify(ch.channel_id, notifyNew, checked)
                          }
                          aria-label={`Notify live starts for ${ch.name}`}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                When a channel toggle is off, notifications for that channel type are suppressed even
                if the global category toggle is on.
              </p>
            </div>
          )}
        </div>

        {/* ── Saved Posts ──────────────────────────────────────────── */}
        <div className="space-y-2 mt-6 pt-4 border-t">
          <div>
            <h3 className="text-sm font-medium">Saved Posts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notifications for ntfy.sh sync activity. Requires a configured ntfy topic.
            </p>
          </div>
          <NotifyRow
            label="Sync completed with new posts"
            description="Notify when an ntfy.sh poll successfully ingests at least one new saved post. Polls that return zero new posts are silent."
            checked={prefs.savedPosts.syncSuccess}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                savedPosts: { ...p.savedPosts, syncSuccess: checked }
              }))
            }
          />
        </div>

        {/* ── Reddit Digest ─────────────────────────────────────────── */}
        <div className="space-y-2 mt-6 pt-4 border-t">
          <div>
            <h3 className="text-sm font-medium">Reddit Digest</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notifications for the bundled Reddit Digest script. Applies to both scheduled
              and on-app-start runs.
            </p>
          </div>
          <NotifyRow
            label="Script run completed successfully"
            description="Notify when the Reddit Digest script finishes with exit code 0. The notification includes the number of posts ingested."
            checked={prefs.redditDigest.runSuccess}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                redditDigest: { ...p.redditDigest, runSuccess: checked }
              }))
            }
          />
          <NotifyRow
            label="Script run failed"
            description="Notify when the Reddit Digest script exits with a non-zero exit code or a JSON parse error."
            checked={prefs.redditDigest.runFailure}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                redditDigest: { ...p.redditDigest, runFailure: checked }
              }))
            }
          />
        </div>

        {/* ── Script Manager ────────────────────────────────────────── */}
        <div className="space-y-2 mt-6 pt-4 border-t">
          <div>
            <h3 className="text-sm font-medium">Script Manager</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Notifications for auto-triggered script runs. Manual runs from the Script Manager UI
              are never notified regardless of these toggles.
            </p>
          </div>
          <NotifyRow
            label="Auto-run completed successfully"
            description="Notify when a scheduled, on-app-start, or catch-up script run exits with code 0."
            checked={prefs.scriptManager.autoRunSuccess}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                scriptManager: { ...p.scriptManager, autoRunSuccess: checked }
              }))
            }
          />
          <NotifyRow
            label="Auto-run failed"
            description="Notify when a scheduled, on-app-start, or catch-up script run exits with a non-zero code."
            checked={prefs.scriptManager.autoRunFailure}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                scriptManager: { ...p.scriptManager, autoRunFailure: checked }
              }))
            }
          />
          <NotifyRow
            label="Missed runs warning"
            description="Notify on app startup when a script missed more than one scheduled run while the app was closed."
            checked={prefs.scriptManager.startupWarning}
            onCheckedChange={(checked) =>
              void updatePrefs((p) => ({
                ...p,
                scriptManager: { ...p.scriptManager, startupWarning: checked }
              }))
            }
          />
        </div>
      </div>
    </div>
  )
}

export default function Settings(): React.ReactElement {
  const [searchParams] = useSearchParams()
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  return (
    <div className="flex flex-col h-full px-6 py-4">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <Tabs defaultValue={searchParams.get('tab') ?? 'features'} className="flex-1">
        <TabsList>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="app-behavior">App Behavior</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          {redditDigestEnabled && <TabsTrigger value="reddit-digest">Reddit Digest</TabsTrigger>}
          {savedPostsEnabled && <TabsTrigger value="saved-posts">Saved Posts</TabsTrigger>}
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>
        <TabsContent value="app-behavior" className="mt-4">
          <AppBehaviorTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="youtube" className="mt-4">
          <YouTubeTab />
        </TabsContent>
        {redditDigestEnabled && (
          <TabsContent value="reddit-digest" className="mt-4">
            <RedditDigestTab />
          </TabsContent>
        )}
        {savedPostsEnabled && (
          <TabsContent value="saved-posts" className="mt-4">
            <SavedPostsTab />
          </TabsContent>
        )}
        <TabsContent value="appearance" className="mt-4">
          <AppearanceTab />
        </TabsContent>
        <TabsContent value="scripts" className="mt-4">
          <ScriptsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
