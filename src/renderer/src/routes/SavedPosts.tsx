import React, { useEffect, useState } from 'react'
import { IPC } from '../../../shared/ipc-types'
import type { SavedPost } from '../../../shared/ipc-types'
import { useSavedPosts } from '../hooks/useSavedPosts'
import { useNtfyStaleness } from '../hooks/useNtfyStaleness'
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
import { Bookmark, Search, Tags, RefreshCw, Plus, X } from 'lucide-react'
import { formatRelativeTime } from '../lib/time'

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
            onClick={() => void handleRemoveTag(tag)}
            className="hover:text-red-500"
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
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => void handleAddTag()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          + tag
        </button>
      )}
    </div>
  )
}

export default function SavedPosts(): React.ReactElement {
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
  } = useSavedPosts()
  const staleness = useNtfyStaleness()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [dismissedStale, setDismissedStale] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [allTags, setAllTags] = useState<string[]>([])
  const [subreddits, setSubreddits] = useState<string[]>([])

  useEffect(() => {
    if (!staleness.loading && !staleness.topicConfigured) {
      setShowOnboarding(true)
    }
  }, [staleness.loading, staleness.topicConfigured])

  useEffect(() => {
    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setAllTags(result as string[]))
      .catch(console.error)
  }, [posts])

  useEffect(() => {
    // Derive unique subreddits from all posts
    const subs = new Set<string>()
    posts.forEach((p) => {
      if (p.subreddit) subs.add(p.subreddit)
    })
    setSubreddits(Array.from(subs).sort())
  }, [posts])

  const handleSyncNow = async (): Promise<void> => {
    setSyncing(true)
    try {
      await window.api.invoke(IPC.REDDIT_POLL_NTFY)
      await refetch()
      staleness.refetch()
      setDismissedStale(true)
    } catch (err) {
      console.error('Sync failed:', err)
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
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
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
          <SelectTrigger className="w-[160px] h-9">
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
          <SelectTrigger className="w-[140px] h-9">
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
                    {post.subreddit && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        r/{post.subreddit}
                      </Badge>
                    )}
                    {post.author && (
                      <span className="text-xs text-muted-foreground">
                        u/{post.author}
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
                    onClick={() => {
                      const url = `https://reddit.com${post.permalink}`
                      window.api.invoke('shell:openExternal', url).catch(console.error)
                    }}
                    className="text-sm font-medium text-left hover:text-primary transition-colors line-clamp-2 w-full"
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
