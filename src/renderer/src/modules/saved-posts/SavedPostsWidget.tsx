import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedPosts } from '../../hooks/useSavedPosts'
import { useSavedPostsConfig } from '../../hooks/useSavedPostsConfig'
import { useNtfyStaleness } from '../../hooks/useNtfyStaleness'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { SavedPostsControls } from './SavedPostsControls'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Bookmark, ArrowUp, Clock } from 'lucide-react'
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'
import { IPC, type SavedPost, type LinkSource } from '../../../../shared/ipc-types'
import { NtfyOnboardingWizard } from './NtfyOnboardingWizard'

const SOURCE_LABELS: Record<LinkSource, string> = {
  reddit: 'Reddit',
  x: 'X',
  bsky: 'Bluesky',
  generic: 'Link'
}

function formatAuthor(post: SavedPost): string | null {
  if (!post.author) return null
  if (post.source === 'reddit') return `u/${post.author}`
  if (post.source === 'x') return `@${post.author}`
  return post.author
}

function PostCard({
  post,
  config,
  onOpen
}: {
  post: SavedPost
  config: { showMetadata: boolean; showSourceBadge: boolean; showUrl: boolean; showBodyPreview: boolean; cardDensity: 'compact' | 'detailed' }
  onOpen: (post: SavedPost) => void
}): React.ReactElement {
  const author = formatAuthor(post)
  return (
    <button
      onClick={() => onOpen(post)}
      className={
        config.cardDensity === 'compact'
          ? 'flex items-start gap-2 py-1 w-full text-left hover:opacity-75 transition-opacity'
          : 'flex flex-col gap-1.5 py-2 px-2 rounded bg-muted/30 w-full text-left hover:bg-muted/50 transition-colors'
      }
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {config.showSourceBadge && (
          <Badge variant="outline" className="text-xs shrink-0">
            {SOURCE_LABELS[post.source]}
          </Badge>
        )}
        {post.source === 'reddit' && post.subreddit && config.showMetadata && (
          <Badge variant="secondary" className="text-xs shrink-0">
            r/{post.subreddit}
          </Badge>
        )}
        {author && config.showMetadata && (
          <span className="text-xs text-muted-foreground">{author}</span>
        )}
      </div>
      <div
        className={
          config.cardDensity === 'compact'
            ? 'text-sm font-medium line-clamp-2 flex-1'
            : 'text-sm font-medium'
        }
      >
        {post.title}
      </div>
      {config.showUrl && (
        <p className="text-xs text-muted-foreground truncate max-w-full">{post.url}</p>
      )}
      {config.showBodyPreview && post.body && (
        <p className="text-xs text-muted-foreground line-clamp-2">{post.body}</p>
      )}
      <div className="flex items-center gap-2 text-xs">
        {post.score !== null && config.showMetadata && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-foreground/80 whitespace-nowrap">
            <ArrowUp className="h-3 w-3" />
            <span>{post.score.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-foreground/80 whitespace-nowrap" title={new Date(post.saved_at * 1000).toLocaleString()}>
          <Clock className="h-3 w-3" />
          <span>{formatRelativeTime(post.saved_at)}</span>
        </div>
      </div>
    </button>
  )
}

function SavedPostsWidget(): React.ReactElement {
  const instance = useWidgetInstance()
  const { config, setConfig } = useSavedPostsConfig(instance.instanceId)
  const staleness = useNtfyStaleness()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Fetch posts with the widget's configured filters
  const { posts, loading, refetch } = useSavedPosts({
    limit: config.max_posts,
    offset: 0,
    subreddit_filter: config.subreddit_filter,
    tag_filter: config.tag_filter,
    source_filter: config.source_filter,
    sort_by: config.sort_by,
    sort_dir: config.sort_dir
  })

  // Derive available options for the controls
  const [allTags, setAllTags] = useState<string[]>([])
  const availableSubreddits = useMemo(() => {
    const subs = new Set<string>()
    posts.forEach((p) => {
      if (p.subreddit) subs.add(p.subreddit)
    })
    return Array.from(subs).sort()
  }, [posts])

  useEffect(() => {
    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setAllTags(result as string[]))
      .catch(console.error)
  }, [posts])

  // Listen for ntfy ingest complete push events
  useEffect(() => {
    const listener = (): void => {
      void refetch()
    }
    window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    return () => {
      window.api.off(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    }
  }, [refetch])

  // Group posts by source when configured
  const groupedPosts = useMemo(() => {
    if (config.group_by !== 'source') return null
    const groups = new Map<LinkSource, SavedPost[]>()
    for (const post of posts) {
      const existing = groups.get(post.source)
      if (existing) {
        existing.push(post)
      } else {
        groups.set(post.source, [post])
      }
    }
    // Return groups in configured sourceOrder, skip empty groups
    return config.sourceOrder
      .filter((source) => groups.has(source))
      .map((source) => ({ source, posts: groups.get(source)! }))
  }, [posts, config.group_by, config.sourceOrder])

  if (!staleness.loading && !staleness.topicConfigured) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Saved Posts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Set up mobile saving to get started.
          </p>
          <Button size="sm" onClick={() => setShowOnboarding(true)}>
            Set Up
          </Button>
          <NtfyOnboardingWizard
            isOpen={showOnboarding}
            onClose={() => setShowOnboarding(false)}
            onComplete={() => {
              setShowOnboarding(false)
              staleness.refetch()
              void refetch()
            }}
          />
        </CardContent>
      </Card>
    )
  }

  const handleOpenExternal = (post: SavedPost): void => {
    const url = post.source === 'reddit' ? `https://reddit.com${post.permalink}` : post.url
    window.api.invoke('shell:openExternal', url).catch(console.error)
  }

  const cardConfig = {
    showMetadata: config.showMetadata,
    showSourceBadge: config.showSourceBadge,
    showUrl: config.showUrl,
    showBodyPreview: config.showBodyPreview,
    cardDensity: config.cardDensity
  }

  const renderPostList = (postsToRender: SavedPost[]): React.ReactElement => (
    <div className={config.cardDensity === 'compact' ? 'space-y-2' : 'space-y-3'}>
      {postsToRender.map((post) => (
        <PostCard
          key={post.post_id}
          post={post}
          config={cardConfig}
          onOpen={handleOpenExternal}
        />
      ))}
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Saved Posts
          </CardTitle>
          <div className="flex items-center gap-2">
            <SavedPostsControls
              config={config}
              availableSubreddits={availableSubreddits}
              availableTags={allTags}
              onConfigChange={setConfig}
            />
            {config.showViewAllLink && (
              <button
                onClick={() => navigate('/saved-posts')}
                className="text-xs text-primary hover:underline"
              >
                View All
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved posts yet.</p>
        ) : groupedPosts ? (
          <div className="space-y-4">
            {groupedPosts.map(({ source, posts: groupPosts }) => (
              <div key={source}>
                {config.showGroupHeaders && (
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {SOURCE_LABELS[source]}
                  </h4>
                )}
                {renderPostList(groupPosts)}
              </div>
            ))}
          </div>
        ) : (
          renderPostList(posts)
        )}
      </CardContent>
      <NtfyOnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={() => {
          setShowOnboarding(false)
          staleness.refetch()
          void refetch()
        }}
      />
    </Card>
  )
}

// Register widget in renderer module registry
registerRendererModule({
  id: 'saved_posts',
  displayName: 'Saved Posts',
  widget: SavedPostsWidget
})

export default SavedPostsWidget

