import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedPostsSummary } from '../../hooks/useSavedPostsSummary'
import { useNtfyStaleness } from '../../hooks/useNtfyStaleness'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Bookmark } from 'lucide-react'
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'
import { IPC, type SavedPostSummary } from '../../../../shared/ipc-types'
import { NtfyOnboardingWizard } from './NtfyOnboardingWizard'

function SavedPostsWidget(): React.ReactElement {
  const { posts: initialPosts, loading: initialLoading } = useSavedPostsSummary()
  const staleness = useNtfyStaleness()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [posts, setPosts] = useState(initialPosts)
  const [loading, setLoading] = useState(initialLoading)

  useEffect(() => {
    setPosts(initialPosts)
    setLoading(initialLoading)
  }, [initialPosts, initialLoading])

  const refetchPosts = useCallback(() => {
    window.api
      .invoke(IPC.REDDIT_GET_SAVED_POSTS_SUMMARY)
      .then((data) => {
        setPosts(data as SavedPostSummary[])
      })
      .catch(console.error)
  }, [])

  // Listen for ntfy ingest complete push events
  useEffect(() => {
    const listener = (): void => {
      refetchPosts()
    }
    window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    return () => {
      window.api.off(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    }
  }, [refetchPosts])

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
              refetchPosts()
            }}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            Saved Posts
          </CardTitle>
          <button
            onClick={() => navigate('/saved-posts')}
            className="text-xs text-primary hover:underline"
          >
            View All
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved posts yet.</p>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.post_id} className="flex items-start gap-2 py-1">
                {post.subreddit && (
                  <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">
                    r/{post.subreddit}
                  </Badge>
                )}
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => {
                      const url = `https://reddit.com${post.permalink}`
                      window.api.invoke('shell:openExternal', url).catch(console.error)
                    }}
                    className="text-sm text-left font-medium hover:text-primary transition-colors line-clamp-2 w-full"
                  >
                    {post.title}
                  </button>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatRelativeTime(post.saved_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
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
