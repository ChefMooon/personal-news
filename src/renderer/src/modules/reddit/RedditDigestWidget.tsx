import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRedditDigest } from '../../hooks/useRedditDigest'
import { DEFAULT_DIGEST_VIEW_CONFIG, useRedditDigestConfig } from '../../hooks/useRedditDigestConfig'
import { useRedditDigestWeeks } from '../../hooks/useRedditDigestWeeks'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { RedditDigestSettingsPanel } from './RedditDigestSettingsPanel'
import { SubredditColumn } from './SubredditColumn'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
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
import { RefreshCcw, RotateCcw, Settings2, X } from 'lucide-react'
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'
import type { DigestPost, DigestViewConfig } from '../../../../shared/ipc-types'

function RedditDigestWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance()
  const { config, setConfig } = useRedditDigestConfig(instanceId)
  const { weeks, loading: weeksLoading } = useRedditDigestWeeks()
  const [isEditing, setIsEditing] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<DigestViewConfig | null>(null)
  const [editContentHeight, setEditContentHeight] = useState<number | null>(null)
  const cardContentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isEditing) {
      return
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  const latestWeek = weeks[0]?.week_start_date ?? null
  const selectedSpecificWeek = config.selected_week ?? latestWeek
  const requestWeek = config.week_mode === 'latest'
    ? latestWeek
    : config.week_mode === 'specific'
      ? selectedSpecificWeek
      : null
  const { posts, loading } = useRedditDigest(requestWeek, config.hide_viewed)

  const rangeWeekSet = useMemo(() => {
    if (config.week_mode !== 'range') {
      return null
    }
    return new Set(weeks.slice(0, config.week_range_count).map((week) => week.week_start_date))
  }, [config.week_mode, config.week_range_count, weeks])

  const visiblePosts = useMemo(() => {
    if (config.week_mode !== 'range' || !rangeWeekSet) {
      return posts
    }
    return posts.filter((post) => rangeWeekSet.has(post.week_start_date))
  }, [config.week_mode, posts, rangeWeekSet])

  const availableSubreddits = useMemo(
    () => [...new Set(visiblePosts.map((p) => p.subreddit))].sort(),
    [visiblePosts]
  )

  const selectedSubreddits = useMemo(
    () => config.selected_subreddits.filter((subreddit) => availableSubreddits.includes(subreddit)),
    [availableSubreddits, config.selected_subreddits]
  )

  const orderedSubreddits = useMemo(() => {
    const availableMap = new Map(availableSubreddits.map((subreddit) => [subreddit, subreddit]))
    const inOrder = config.subreddit_order
      .map((subreddit) => availableMap.get(subreddit))
      .filter((subreddit): subreddit is string => subreddit !== undefined)
    const seen = new Set(inOrder)
    const rest = availableSubreddits.filter((subreddit) => !seen.has(subreddit))
    const ordered = [...inOrder, ...rest]

    if (config.pinned_subreddits.length === 0) {
      return ordered
    }

    const pinned = new Set(config.pinned_subreddits)
    const pinnedItems = ordered.filter((subreddit) => pinned.has(subreddit))
    const unpinnedItems = ordered.filter((subreddit) => !pinned.has(subreddit))
    return [...pinnedItems, ...unpinnedItems]
  }, [availableSubreddits, config.pinned_subreddits, config.subreddit_order])

  const filteredPosts = useMemo(
    () =>
      config.subreddit_mode === 'selected'
        ? visiblePosts.filter((post) => selectedSubreddits.includes(post.subreddit))
        : visiblePosts,
    [config.subreddit_mode, selectedSubreddits, visiblePosts]
  )

  // Sort posts client-side
  const sortedPosts = useMemo(() => {
    return [...filteredPosts].sort((a, b) => {
      const aVal = a[config.sort_by] ?? 0
      const bVal = b[config.sort_by] ?? 0
      return config.sort_dir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
    })
  }, [filteredPosts, config.sort_by, config.sort_dir])

  const groups = useMemo((): Map<string, DigestPost[]> => {
    const map = new Map<string, DigestPost[]>()
    if (config.group_by === 'subreddit') {
      for (const post of sortedPosts) {
        const existing = map.get(post.subreddit) ?? []
        existing.push(post)
        map.set(post.subreddit, existing)
      }
    } else {
      map.set('All', sortedPosts)
    }
    return map
  }, [sortedPosts, config.group_by])

  const lastFetched = visiblePosts.length > 0 ? Math.max(...visiblePosts.map((p) => p.fetched_at)) : null
  const groupKeys = useMemo(() => {
    if (config.group_by !== 'subreddit') {
      return Array.from(groups.keys())
    }

    const orderedKeys = orderedSubreddits.filter((subreddit) => groups.has(subreddit))
    const orderedKeySet = new Set(orderedKeys)
    const remainingKeys = Array.from(groups.keys()).filter((subreddit) => !orderedKeySet.has(subreddit))
    return [...orderedKeys, ...remainingKeys]
  }, [config.group_by, groups, orderedSubreddits])
  const widgetTitle = label ?? 'Reddit Digest'
  const effectiveLoading = loading || weeksLoading

  const weekSummaryText = config.week_mode === 'range'
    ? `Showing last ${config.week_range_count} weeks`
    : requestWeek
      ? `Week of ${requestWeek}`
      : null

  function handleOpenEdit(): void {
    const currentHeight = cardContentRef.current?.getBoundingClientRect().height
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight)
    }
    setSnapshotConfig(config)
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
    setConfig(DEFAULT_DIGEST_VIEW_CONFIG)
    setSnapshotConfig(DEFAULT_DIGEST_VIEW_CONFIG)
  }

  const digestContent = effectiveLoading ? (
    <p className="text-sm text-muted-foreground">Loading posts...</p>
  ) : visiblePosts.length === 0 ? (
    <p className="text-sm text-muted-foreground">No digest posts yet. Run the Reddit Digest script to populate.</p>
  ) : sortedPosts.length === 0 ? (
    <p className="text-sm text-muted-foreground">No posts match the current filter.</p>
  ) : config.layout_mode === 'columns' ? (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 220px))' }}>
      {groupKeys.map((key) => (
        <SubredditColumn key={key} label={key} posts={groups.get(key) ?? []} maxPosts={config.max_posts_per_group} />
      ))}
    </div>
  ) : (
    <Tabs defaultValue={groupKeys[0]}>
      <TabsList className="mb-2 flex-wrap h-auto">
        {groupKeys.map((key) => (
          <TabsTrigger key={key} value={key} className="text-xs">
            {key === 'All' ? 'All' : `r/${key}`}
          </TabsTrigger>
        ))}
      </TabsList>
      {groupKeys.map((key) => (
        <TabsContent key={key} value={key}>
          <SubredditColumn label={key} posts={groups.get(key) ?? []} maxPosts={config.max_posts_per_group} />
        </TabsContent>
      ))}
    </Tabs>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{widgetTitle}</CardTitle>
            {lastFetched && (
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(lastFetched)}
              </span>
            )}
            {weekSummaryText && (
              <span className="text-xs text-muted-foreground">
                {weekSummaryText}
              </span>
            )}
          </div>
          {isEditing ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
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
                    type="button"
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
                      Reset all Reddit Digest widget settings to their defaults? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFactoryReset}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <button
                type="button"
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
              type="button"
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Reddit Digest widget settings"
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
        <div className={isEditing ? 'reddit-digest-card-edit' : undefined}>
          <div className={isEditing ? 'reddit-digest-card-edit__preview' : undefined}>
            {digestContent}
          </div>
          {isEditing && (
            <div className="reddit-digest-card-edit__panel">
              <RedditDigestSettingsPanel
                config={config}
                availableSubreddits={availableSubreddits}
                availableWeeks={weeks}
                onChange={setConfig}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Register widget in renderer module registry
registerRendererModule({
  id: 'reddit_digest',
  displayName: 'Reddit Digest',
  widget: RedditDigestWidget
})

export default RedditDigestWidget
