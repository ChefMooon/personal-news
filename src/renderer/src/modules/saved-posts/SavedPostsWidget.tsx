import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedPostsSummary } from '../../hooks/useSavedPostsSummary'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Bookmark } from 'lucide-react'
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'

function SavedPostsWidget(): React.ReactElement {
  const { posts, loading } = useSavedPostsSummary()
  const navigate = useNavigate()

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
