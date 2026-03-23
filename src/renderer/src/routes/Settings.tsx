import React, { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Switch } from '../components/ui/switch'
import { useTheme } from '../providers/ThemeProvider'
import { useYouTubeChannels } from '../hooks/useYouTubeChannels'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import {
  IPC,
  type IpcMutationResult,
  type YouTubeCacheClearResult,
  type YouTubeApiKeyStatus,
  type DigestWeekSummary
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
  const [channelToRemove, setChannelToRemove] = useState<{ id: string; name: string } | null>(null)
  const [addInput, setAddInput] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [intervalValue, setIntervalValue] = useState('15')
  const [savingInterval, setSavingInterval] = useState(false)
  const [pollingNow, setPollingNow] = useState(false)
  const [clearingVideoCache, setClearingVideoCache] = useState(false)
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

  const removeChannel = async (channelId: string): Promise<void> => {
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
      requestAnimationFrame(() => {
        addInputRef.current?.focus()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove channel.')
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

  const pollNow = async (): Promise<void> => {
    setPollingNow(true)
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_POLL_NOW)) as IpcMutationResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to run YouTube RSS poll.')
        return
      }
      setMessage('YouTube RSS poll completed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run YouTube RSS poll.')
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
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(IPC.YOUTUBE_CLEAR_VIDEOS_CACHE)) as YouTubeCacheClearResult
      if (!result.ok) {
        setError(result.error ?? 'Failed to clear YouTube cache.')
        return
      }
      setMessage(`YouTube cache cleared. Removed ${result.deletedCount} video entries.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear YouTube cache.')
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
                      setChannelToRemove({ id: ch.channel_id, name: ch.name })
                      setMessage(null)
                      setError(null)
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
          <Input
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
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        setError(err instanceof Error ? err.message : 'Failed to load Reddit Digest settings.')
      })

    window.api
      .invoke(IPC.SETTINGS_GET, 'reddit_digest_week_start')
      .then((raw) => {
        setWeekStart(raw === '0' ? '0' : '1')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Reddit Digest week start setting.')
      })

    window.api
      .invoke(IPC.REDDIT_GET_DIGEST_WEEKS)
      .then((data) => {
        setWeeks(data as DigestWeekSummary[])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load Reddit Digest records.')
      })
  }

  useEffect(() => {
    load()
  }, [])

  const persist = async (nextSubreddits: string[], successMessage: string): Promise<void> => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'reddit_digest_subreddits', JSON.stringify(nextSubreddits))
      setSubreddits(nextSubreddits)
      setMessage(successMessage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Reddit Digest settings.')
    } finally {
      setSaving(false)
    }
  }

  const addSubreddit = async (): Promise<void> => {
    const normalized = normalizeSubredditInput(draft)
    if (!normalized) {
      setError('Subreddits may contain letters, numbers, and underscores only.')
      return
    }
    if (subreddits.includes(normalized)) {
      setError(`r/${normalized} is already configured.`)
      return
    }

    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const validation = (await window.api.invoke(
        IPC.REDDIT_VALIDATE_DIGEST_SUBREDDIT,
        normalized
      )) as IpcMutationResult
      if (!validation.ok) {
        setError(validation.error ?? `r/${normalized} could not be added.`)
        return
      }

      const next = [...subreddits, normalized].sort()
      await persist(next, 'Subreddit saved.')
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate subreddit.')
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
    setMessage(null)
    setError(null)
    try {
      await window.api.invoke(IPC.SETTINGS_SET, 'reddit_digest_week_start', nextWeekStart)
      setWeekStart(nextWeekStart)
      setMessage('Week start preference saved. It will apply on the next Reddit Digest run.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save week start preference.')
    } finally {
      setSaving(false)
    }
  }

  const deleteWeek = async (weekStartDate: string): Promise<void> => {
    if (!window.confirm(`Delete all Reddit Digest posts for the week of ${weekStartDate}?`)) {
      return
    }

    setPruning(true)
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_PRUNE_DIGEST_POSTS, {
        delete_week: weekStartDate
      })) as { ok: boolean; error: string | null; deletedCount: number }
      if (!result.ok) {
        setError(result.error ?? 'Failed to delete Reddit Digest week.')
        return
      }
      load()
      setMessage(`Deleted ${result.deletedCount} posts for the week of ${weekStartDate}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete Reddit Digest week.')
    } finally {
      setPruning(false)
    }
  }

  const pruneOldWeeks = async (): Promise<void> => {
    const parsed = Number.parseInt(keepWeeks, 10)
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError('Keep last N weeks must be at least 1.')
      return
    }
    if (!window.confirm(`Delete all Reddit Digest posts older than the most recent ${parsed} weeks?`)) {
      return
    }

    setPruning(true)
    setMessage(null)
    setError(null)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_PRUNE_DIGEST_POSTS, {
        keep_weeks: parsed
      })) as { ok: boolean; error: string | null; deletedCount: number }
      if (!result.ok) {
        setError(result.error ?? 'Failed to prune Reddit Digest posts.')
        return
      }
      load()
      setMessage(result.deletedCount === 0 ? 'No old Reddit Digest weeks needed pruning.' : `Pruned ${result.deletedCount} Reddit Digest posts.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prune Reddit Digest posts.')
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
          <Input
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
            <Input
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

      {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}

function FeaturesTab(): React.ReactElement {
  const { enabled, setEnabled } = useRedditDigestEnabled()

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
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
    </div>
  )
}

function ScriptsTab(): React.ReactElement {
  const [dir, setDir] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'script_home_dir')
      .then((v) => { setDir(typeof v === 'string' ? v : '') })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load script home directory.')
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
          <Input
            value={dir}
            readOnly
            placeholder="No folder selected"
            className="flex-1"
          />
          <Button
            onClick={async () => {
              setError(null)
              const picked = await window.api.invoke(IPC.DIALOG_SHOW_OPEN_FOLDER) as string | null
              if (picked === null) return
              try {
                await window.api.invoke(IPC.SETTINGS_SET, 'script_home_dir', picked)
                setDir(picked)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save script home directory.')
              }
            }}
          >
            Browse
          </Button>
        </div>
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
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
  const [testResult, setTestResult] = useState<string | null>(null)
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
      .catch(console.error)
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
    window.api.invoke(IPC.SETTINGS_GET, 'ntfy_topic').then((v) => setTopic((v as string) || '')).catch(console.error)
    window.api.invoke(IPC.SETTINGS_GET, 'ntfy_server_url').then((v) => setServer((v as string) || 'https://ntfy.sh')).catch(console.error)
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_POLL_NTFY)) as { postsIngested: number }
      setTestResult(`Connected — ${result.postsIngested} messages received.`)
      loadStatus()
    } catch {
      setTestResult('Could not reach the ntfy server.')
    } finally {
      setTesting(false)
    }
  }

  const savePollInterval = async (): Promise<void> => {
    setSavingInterval(true)
    setTestResult(null)
    const parsed = Number.parseInt(intervalValue, 10)
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_SET_NTFY_POLL_INTERVAL,
        parsed
      )) as IpcMutationResult
      if (!result.ok) {
        setTestResult(result.error ?? 'Failed to save ntfy poll interval.')
        return
      }
      setTestResult('ntfy poll interval saved.')
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Failed to save ntfy poll interval.')
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
          <Input
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
              className="font-mono underline underline-offset-2 decoration-muted-foreground/50 hover:text-blue-400 transition-colors inline-flex items-center gap-1"
              onClick={() => {
                const base = server.replace(/\/+$/, '')
                window.api.invoke('shell:openExternal', `${base}/${topic}`).catch(console.error)
              }}
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
            <span className={isStale ? 'text-amber-500 font-medium' : ''}>
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
      {testResult && (
        <p className={`text-xs ${testResult.startsWith('Connected') ? 'text-emerald-600' : 'text-red-600'}`}>
          {testResult}
        </p>
      )}
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
                    setTestResult(`Cleared ${r.deletedCount} saved posts.`)
                  })
                  .catch((err) => {
                    setTestResult(err instanceof Error ? err.message : 'Failed to clear database.')
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

export default function Settings(): React.ReactElement {
  const [searchParams] = useSearchParams()
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  return (
    <div className="flex flex-col h-full px-6 py-4">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <Tabs defaultValue={searchParams.get('tab') ?? 'api-keys'} className="flex-1">
        <TabsList>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="youtube">YouTube</TabsTrigger>
          {redditDigestEnabled && <TabsTrigger value="reddit-digest">Reddit Digest</TabsTrigger>}
          <TabsTrigger value="saved-posts">Saved Posts</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="scripts">Scripts</TabsTrigger>
        </TabsList>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>
        <TabsContent value="api-keys" className="mt-4">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="youtube" className="mt-4">
          <YouTubeTab />
        </TabsContent>
        {redditDigestEnabled && (
          <TabsContent value="reddit-digest" className="mt-4">
            <RedditDigestTab />
          </TabsContent>
        )}
        <TabsContent value="saved-posts" className="mt-4">
          <SavedPostsTab />
        </TabsContent>
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
