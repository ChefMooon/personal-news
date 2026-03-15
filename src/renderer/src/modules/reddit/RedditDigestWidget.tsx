import React, { useMemo } from 'react'
import { useRedditDigest } from '../../hooks/useRedditDigest'
import { useRedditDigestConfig } from '../../hooks/useRedditDigestConfig'
import { DigestViewControls } from './DigestViewControls'
import { SubredditColumn } from './SubredditColumn'
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/tabs'
import { formatRelativeTime } from '../../lib/time'
import { registerRendererModule } from '../registry'
import type { DigestPost } from '../../../../shared/ipc-types'

function RedditDigestWidget(): React.ReactElement {
  const { posts, loading } = useRedditDigest()
  const { config, setConfig } = useRedditDigestConfig()

  // Sort posts client-side
  const sortedPosts = useMemo(() => {
    const sorted = [...posts].sort((a, b) => {
      const aVal = a[config.sort_by] ?? 0
      const bVal = b[config.sort_by] ?? 0
      return config.sort_dir === 'desc' ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number)
    })
    return sorted
  }, [posts, config.sort_by, config.sort_dir])

  // Group posts client-side
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

  // Last fetched timestamp
  const lastFetched = posts.length > 0 ? Math.max(...posts.map((p) => p.fetched_at)) : null

  const groupKeys = Array.from(groups.keys())

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Reddit Digest</CardTitle>
            {lastFetched && (
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(lastFetched)}
              </span>
            )}
          </div>
          <DigestViewControls config={config} onChange={setConfig} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading posts...</p>
        ) : posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No digest posts yet. Run the Reddit Digest script to populate.</p>
        ) : config.layout_mode === 'columns' ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {groupKeys.map((key) => (
              <SubredditColumn key={key} label={key} posts={groups.get(key) ?? []} />
            ))}
          </div>
        ) : (
          // Tabs layout
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
                <SubredditColumn label={key} posts={groups.get(key) ?? []} />
              </TabsContent>
            ))}
          </Tabs>
        )}
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
