import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedPosts } from '../../hooks/useSavedPosts'
import {
  useSavedPostsConfig,
  DEFAULT_SAVED_POSTS_VIEW_CONFIG
} from '../../hooks/useSavedPostsConfig'
import { useNtfyStaleness } from '../../hooks/useNtfyStaleness'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { SavedPostsSettingsPanel } from './SavedPostsSettingsPanel'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Bookmark, ArrowUp, Clock, Settings2, RotateCcw, RefreshCcw, X } from 'lucide-react'
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
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'
import { IPC, type SavedPost, type LinkSource, type SavedPostsViewConfig } from '../../../../shared/ipc-types'
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
  const widgetTitle = instance.label ?? 'Saved Posts'
  const { config, setConfig } = useSavedPostsConfig(instance.instanceId)
  const staleness = useNtfyStaleness()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<SavedPostsViewConfig | null>(null)
  const [editContentHeight, setEditContentHeight] = useState<number | null>(null)
  const cardContentRef = useRef<HTMLDivElement | null>(null)

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
    return window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
  }, [refetch])

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

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
            {widgetTitle}
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
    setConfig(DEFAULT_SAVED_POSTS_VIEW_CONFIG)
    setSnapshotConfig(DEFAULT_SAVED_POSTS_VIEW_CONFIG)
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
            {widgetTitle}
          </CardTitle>
          <div className="flex items-center gap-2">
            {config.showViewAllLink && (
              <button
                onClick={() => navigate('/saved-posts')}
                className="text-xs text-primary hover:underline"
              >
                View All
              </button>
            )}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
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
                        Reset all Saved Posts widget settings to their defaults? This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFactoryReset}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
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
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Saved posts widget settings"
                onClick={handleOpenEdit}
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        style={isEditing && editContentHeight ? { height: editContentHeight, overflow: 'hidden' } : undefined}
      >
        <div className={isEditing ? 'saved-posts-card-edit' : undefined}>
          <div className={isEditing ? 'saved-posts-card-edit__preview' : undefined}>
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
          </div>
          {isEditing && (
            <div className="saved-posts-card-edit__panel">
              <SavedPostsSettingsPanel
                config={config}
                availableSubreddits={availableSubreddits}
                availableTags={allTags}
                onChange={setConfig}
              />
            </div>
          )}
        </div>
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

