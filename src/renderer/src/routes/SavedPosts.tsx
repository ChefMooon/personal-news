import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { IPC } from '../../../shared/ipc-types'
import type { SavedPost, LinkSource, ViewedAnalytics } from '../../../shared/ipc-types'
import { useSavedPosts } from '../hooks/useSavedPosts'
import { useNtfyStaleness } from '../hooks/useNtfyStaleness'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { StaleWarning } from '../modules/saved-posts/StaleWarning'
import { NtfyOnboardingWizard } from '../modules/saved-posts/NtfyOnboardingWizard'
import { TagManagementModal } from '../modules/saved-posts/TagManagementModal'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { Bookmark, Search, Tags, RefreshCw, Plus, X, Circle, CircleCheck } from 'lucide-react'
import { formatRelativeTime } from '../lib/time'
import { toRedditPostUrl } from '../lib/utils'

function PostTagEditor({
  post,
  allTags,
  onUpdate
}: {
  post: SavedPost
  allTags: string[]
  onUpdate: () => void
}): React.ReactElement {
  const [adding, setAdding] = useState(false)
  const [newTag, setNewTag] = useState('')

  const handleAddTag = async (): Promise<void> => {
    const trimmed = newTag.trim()
    if (!trimmed) return
    const updated = [...post.tags, trimmed]
    await window.api.invoke(IPC.REDDIT_UPDATE_POST_TAGS, post.post_id, updated)
    setNewTag('')
    setAdding(false)
    onUpdate()
  }

  const handleRemoveTag = async (tag: string): Promise<void> => {
    const updated = post.tags.filter((t) => t !== tag)
    await window.api.invoke(IPC.REDDIT_UPDATE_POST_TAGS, post.post_id, updated)
    onUpdate()
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {post.tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-xs gap-1">
          {tag}
          <button
            type="button"
            onClick={() => void handleRemoveTag(tag)}
            className="hover:text-destructive"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            className="h-6 w-24 text-xs"
            placeholder="tag name"
            aria-label="New tag name"
            list="tag-suggestions"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAddTag()
              if (e.key === 'Escape') setAdding(false)
            }}
            autoFocus
          />
          <datalist id="tag-suggestions">
            {allTags
              .filter((t) => !post.tags.includes(t))
              .map((t) => (
                <option key={t} value={t} />
              ))}
          </datalist>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={() => void handleAddTag()}
            aria-label="Add tag"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-pressed={adding}
        >
          + tag
        </button>
      )}
    </div>
  )
}

const SOURCE_LABELS: Record<LinkSource, string> = {
  reddit: 'Reddit',
  x: 'X',
  bsky: 'Bluesky',
  generic: 'Link'
}

export default function SavedPosts(): React.ReactElement {
  const { enabled } = useSavedPostsEnabled()

  if (!enabled) {
    return (
      <div className="flex flex-col h-full px-6 py-4">
        <h1 className="text-xl font-semibold mb-4">Saved Posts</h1>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-muted-foreground">Saved Posts is disabled.</p>
            <p className="text-sm text-muted-foreground">
              Enable it in{' '}
              <Link to="/settings?tab=features" className="underline hover:text-foreground">
                Settings → Features
              </Link>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return <SavedPostsContent />
}

function SavedPostsContent(): React.ReactElement {
  const [source, setSource] = useState<string | null>(null)
  const [hideViewed, setHideViewed] = useState(false)
  const [analytics, setAnalytics] = useState<ViewedAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [bulkLoading, setBulkLoading] = useState(false)
  const {
    posts,
    total,
    loading,
    search,
    setSearch,
    subreddit,
    setSubreddit,
    tag,
    setTag,
    offset,
    setOffset,
    refetch
  } = useSavedPosts({
    source_filter: source ? [source as LinkSource] : undefined,
    hide_viewed: hideViewed
  })
  const staleness = useNtfyStaleness()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [dismissedStale, setDismissedStale] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [subreddits, setSubreddits] = useState<string[]>([])

  const analyticsScope = useMemo(() => {
    return {
      search: search || undefined,
      subreddit_filter: subreddit ? [subreddit] : undefined,
      tag_filter: tag ? [tag] : undefined,
      source_filter: source ? [source as LinkSource] : undefined
    }
  }, [search, subreddit, tag, source])

  const refreshAnalytics = useCallback((): void => {
    setAnalyticsLoading(true)
    window.api
      .invoke(IPC.REDDIT_GET_SAVED_VIEWED_ANALYTICS, analyticsScope)
      .then((data) => setAnalytics(data as ViewedAnalytics))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Saved Posts analytics.')
      })
      .finally(() => setAnalyticsLoading(false))
  }, [analyticsScope])

  useEffect(() => {
    if (!staleness.loading && !staleness.topicConfigured) {
      setShowOnboarding(true)
    }
  }, [staleness.loading, staleness.topicConfigured])

  useEffect(() => {
    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setAllTags(result as string[]))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load tags.')
      })
  }, [posts])

  useEffect(() => {
    // Derive unique subreddits from all posts
    const subs = new Set<string>()
    posts.forEach((p) => {
      if (p.subreddit) subs.add(p.subreddit)
    })
    setSubreddits(Array.from(subs).sort())
  }, [posts])

  useEffect(() => {
    refreshAnalytics()
  }, [refreshAnalytics])

  const handleSyncNow = async (): Promise<void> => {
    setSyncing(true)
    try {
      await window.api.invoke(IPC.REDDIT_POLL_NTFY)
      await refetch()
      staleness.refetch()
      setDismissedStale(true)
      toast.success('Saved Posts sync completed.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sync Saved Posts. Check your ntfy settings.')
    } finally {
      setSyncing(false)
    }
  }

  const handleOnboardingComplete = (): void => {
    setShowOnboarding(false)
    staleness.refetch()
    void refetch()
  }

  const limit = 50
  const hasMore = offset + limit < total

  const setPostViewed = (postId: string, viewed: boolean): void => {
    window.api
      .invoke(IPC.REDDIT_SET_SAVED_POST_VIEWED, postId, viewed)
      .then((result) => {
        const payload = result as { ok: boolean; error: string | null }
        if (!payload.ok) {
          toast.error(payload.error ?? 'Failed to update viewed state.')
          return
        }
        void refetch()
        refreshAnalytics()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to update viewed state.')
      })
  }

  const handleBulkMarkViewed = (): void => {
    setBulkLoading(true)
    window.api
      .invoke(IPC.REDDIT_BULK_SET_SAVED_VIEWED, {
        ...analyticsScope,
        viewed: true
      })
      .then((result) => {
        const payload = result as { ok: boolean; error: string | null; updatedCount: number }
        if (!payload.ok) {
          toast.error(payload.error ?? 'Failed to mark posts as viewed.')
          return
        }
        toast.success(`Marked ${payload.updatedCount} posts as viewed.`)
        void refetch()
        refreshAnalytics()
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to mark posts as viewed.')
      })
      .finally(() => setBulkLoading(false))
  }

  return (
    <div className="flex flex-col h-full px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Bookmark className="h-5 w-5" />
          Saved Posts
          {total > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({total})</span>
          )}
        </h1>
        <div className="flex gap-2">
          <Button
            variant={hideViewed ? 'default' : 'outline'}
            size="sm"
            onClick={() => setHideViewed((prev) => !prev)}
          >
            {hideViewed ? 'Showing Unviewed Only' : 'Hide Viewed'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleBulkMarkViewed} disabled={bulkLoading}>
            {bulkLoading ? 'Marking...' : 'Mark All Viewed'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTagManager(true)}
          >
            <Tags className="h-3.5 w-3.5 mr-1" />
            Manage Tags
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleSyncNow()}
            disabled={syncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </Button>
        </div>
      </div>

      <div className="mb-3 p-2 rounded-md border bg-muted/20 text-xs">
        {analyticsLoading || !analytics ? (
          <span className="text-muted-foreground" role="status" aria-live="polite">Loading analytics...</span>
        ) : (
          <div className="flex items-center gap-4 flex-wrap" role="status" aria-live="polite">
            <span>Total: {analytics.total}</span>
            <span>Viewed: {analytics.viewed}</span>
            <span>Unviewed: {analytics.unviewed}</span>
            <span>Viewed Rate: {(analytics.viewed_rate * 100).toFixed(1)}%</span>
            <span className="text-muted-foreground">
              7d trend: {analytics.trend.map((point) => `${point.day.slice(5)} ${point.viewed_count}`).join(' | ') || 'No viewed activity'}
            </span>
          </div>
        )}
      </div>

      {!dismissedStale && (
        <StaleWarning
          lastPolledAt={staleness.lastPolledAt}
          isStale={staleness.isStale}
          onDismiss={() => setDismissedStale(true)}
          onSyncNow={handleSyncNow}
          loading={syncing}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <label htmlFor="saved-posts-search" className="sr-only">Search posts</label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="saved-posts-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts..."
            className="pl-9 h-9"
          />
        </div>
        <Select
          value={subreddit ?? '_all'}
          onValueChange={(val) => setSubreddit(val === '_all' ? null : val)}
        >
          <SelectTrigger className="w-[160px] h-9" aria-label="Filter by subreddit">
            <SelectValue placeholder="All subreddits" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All subreddits</SelectItem>
            {subreddits.map((s) => (
              <SelectItem key={s} value={s}>
                r/{s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tag ?? '_all'}
          onValueChange={(val) => setTag(val === '_all' ? null : val)}
        >
          <SelectTrigger className="w-[140px] h-9" aria-label="Filter by tag">
            <SelectValue placeholder="All tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All tags</SelectItem>
            {allTags.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={source ?? '_all'}
          onValueChange={(val) => setSource(val === '_all' ? null : val)}
        >
          <SelectTrigger className="w-[140px] h-9" aria-label="Filter by source">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All sources</SelectItem>
            <SelectItem value="reddit">Reddit</SelectItem>
            <SelectItem value="x">X (Twitter)</SelectItem>
            <SelectItem value="bsky">Bluesky</SelectItem>
            <SelectItem value="generic">Other Links</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Post list */}
      <div className="flex-1 overflow-auto">
        {loading && posts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">No saved posts found.</p>
            {!staleness.topicConfigured && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setShowOnboarding(true)}
              >
                Set Up Mobile Saving
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {posts.map((post) => (
              <div
                key={post.post_id}
                className="flex items-start gap-3 py-3 px-3 rounded-md hover:bg-muted/50 border-b last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-xs shrink-0">
                      {SOURCE_LABELS[post.source]}
                    </Badge>
                    {post.source === 'reddit' && post.subreddit && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        r/{post.subreddit}
                      </Badge>
                    )}
                    {post.author && (
                      <span className="text-xs text-muted-foreground">
                        {post.source === 'reddit' ? `u/${post.author}` : post.source === 'x' ? `@${post.author}` : post.author}
                      </span>
                    )}
                    {post.score != null && (
                      <span className="text-xs text-muted-foreground">
                        {post.score} pts
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(post.saved_at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (post.viewed_at === null) {
                        setPostViewed(post.post_id, true)
                      }
                      const url = post.source === 'reddit' ? toRedditPostUrl(post.permalink) : post.url
                      window.api.invoke('shell:openExternal', url).catch((err) => {
                        toast.error(err instanceof Error ? err.message : 'Failed to open link.')
                      })
                    }}
                    className={`text-sm font-medium text-left hover:text-primary transition-colors line-clamp-2 w-full ${
                      post.viewed_at ? 'text-foreground/70' : ''
                    }`}
                    aria-label={`Open saved post: ${post.title}`}
                  >
                    {post.title}
                  </button>
                  {post.note && (
                    <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">
                      {post.note}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <PostTagEditor
                      post={post}
                      allTags={allTags}
                      onUpdate={() => void refetch()}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPostViewed(post.post_id, post.viewed_at === null)}
                  className="mt-0.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label={post.viewed_at ? 'Mark post as unviewed' : 'Mark post as viewed'}
                  aria-pressed={post.viewed_at !== null}
                  title={post.viewed_at ? 'Viewed - click to mark unviewed' : 'Unviewed - click to mark viewed'}
                >
                  {post.viewed_at ? <CircleCheck className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4" />}
                </button>
              </div>
            ))}

            {hasMore && (
              <div className="py-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => setOffset(offset + limit)}
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <NtfyOnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleOnboardingComplete}
      />
      <TagManagementModal
        isOpen={showTagManager}
        onClose={() => setShowTagManager(false)}
        onTagUpdated={() => void refetch()}
      />
    </div>
  )
}
