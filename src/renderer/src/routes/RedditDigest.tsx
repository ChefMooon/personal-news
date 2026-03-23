import React, { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { useRedditDigest } from '../hooks/useRedditDigest'
import { useRedditDigestConfig } from '../hooks/useRedditDigestConfig'
import { useRedditDigestWeeks } from '../hooks/useRedditDigestWeeks'
import { SubredditColumn } from '../modules/reddit/SubredditColumn'
import { DigestPostRow } from '../modules/reddit/DigestPostRow'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../components/ui/select'
import { IPC } from '../../../shared/ipc-types'
import type { DigestPost, DigestViewConfig } from '../../../shared/ipc-types'

type PageViewMode = 'columns' | 'tabs' | 'flat'

export default function RedditDigest(): React.ReactElement {
  const { enabled } = useRedditDigestEnabled()
  const [pageViewMode, setPageViewMode] = useState<PageViewMode>('columns')
  const [viewModeLoaded, setViewModeLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [flatSubreddits, setFlatSubreddits] = useState<string[]>([])

  const { config, setConfig } = useRedditDigestConfig('reddit_digest_page')
  const { weeks, loading: weeksLoading } = useRedditDigestWeeks()
  const latestWeek = weeks[0]?.week_start_date ?? null

  const requestWeek = useMemo(() => {
    if (config.week_mode === 'latest') return latestWeek
    if (config.week_mode === 'specific') return config.selected_week ?? latestWeek
    return null // range mode: fetch all, then filter by rangeWeekSet
  }, [config.week_mode, config.selected_week, latestWeek])

  const { posts, loading: postsLoading } = useRedditDigest(requestWeek)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'reddit_digest_page_view_mode')
      .then((raw) => {
        if (raw === 'tabs' || raw === 'flat' || raw === 'columns') {
          setPageViewMode(raw as PageViewMode)
        }
      })
      .catch(console.error)
      .finally(() => setViewModeLoaded(true))
  }, [])

  const saveViewMode = (mode: PageViewMode): void => {
    setPageViewMode(mode)
    window.api.invoke(IPC.SETTINGS_SET, 'reddit_digest_page_view_mode', mode).catch(console.error)
  }

  const rangeWeekSet = useMemo(() => {
    if (config.week_mode !== 'range') return null
    return new Set(weeks.slice(0, config.week_range_count).map((w) => w.week_start_date))
  }, [config.week_mode, config.week_range_count, weeks])

  const visiblePosts = useMemo(() => {
    if (config.week_mode !== 'range' || !rangeWeekSet) return posts
    return posts.filter((p) => rangeWeekSet.has(p.week_start_date))
  }, [config.week_mode, posts, rangeWeekSet])

  const sortedPosts = useMemo(() => {
    return [...visiblePosts].sort((a, b) => {
      const aVal = a[config.sort_by] ?? 0
      const bVal = b[config.sort_by] ?? 0
      return config.sort_dir === 'desc'
        ? (bVal as number) - (aVal as number)
        : (aVal as number) - (bVal as number)
    })
  }, [visiblePosts, config.sort_by, config.sort_dir])

  const availableSubreddits = useMemo(
    () => [...new Set(sortedPosts.map((p) => p.subreddit))].sort(),
    [sortedPosts]
  )

  const groups = useMemo((): Map<string, DigestPost[]> => {
    const map = new Map<string, DigestPost[]>()
    for (const post of sortedPosts) {
      const existing = map.get(post.subreddit) ?? []
      existing.push(post)
      map.set(post.subreddit, existing)
    }
    return map
  }, [sortedPosts])

  const groupKeys = useMemo(() => [...groups.keys()].sort(), [groups])

  const flatPosts = useMemo(() => {
    let result = sortedPosts
    if (flatSubreddits.length > 0) {
      result = result.filter((p) => flatSubreddits.includes(p.subreddit))
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter((p) => p.title.toLowerCase().includes(q))
    }
    return result
  }, [sortedPosts, flatSubreddits, search])

  const toggleFlatSubreddit = (sr: string): void => {
    setFlatSubreddits((prev) =>
      prev.includes(sr) ? prev.filter((s) => s !== sr) : [...prev, sr]
    )
  }

  const loading = postsLoading || weeksLoading || !viewModeLoaded

  if (!enabled) {
    return (
      <div className="flex flex-col h-full px-6 py-4">
        <h1 className="text-xl font-semibold mb-4">Reddit Digest</h1>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-muted-foreground">Reddit Digest is disabled.</p>
            <p className="text-sm text-muted-foreground">
              Enable it in{' '}
              <Link to="/settings?tab=features" className="underline hover:text-foreground">
                Settings → Features
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10 gap-3 flex-wrap">
        <h1 className="text-xl font-semibold">Reddit Digest</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Week mode */}
          <Select
            value={config.week_mode}
            onValueChange={(val) =>
              setConfig({ ...config, week_mode: val as DigestViewConfig['week_mode'] })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest week</SelectItem>
              <SelectItem value="range">Multi-week range</SelectItem>
              <SelectItem value="specific">Specific week</SelectItem>
            </SelectContent>
          </Select>

          {config.week_mode === 'range' && (
            <Select
              value={String(config.week_range_count)}
              onValueChange={(val) =>
                setConfig({ ...config, week_range_count: Number.parseInt(val, 10) })
              }
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 6, 8, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} weeks
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {config.week_mode === 'specific' && (
            <Select
              value={config.selected_week ?? latestWeek ?? ''}
              onValueChange={(val) => setConfig({ ...config, selected_week: val })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select week" />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w.week_start_date} value={w.week_start_date}>
                    {w.week_start_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sort by */}
          <Select
            value={config.sort_by}
            onValueChange={(val) =>
              setConfig({ ...config, sort_by: val as DigestViewConfig['sort_by'] })
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="num_comments">Comments</SelectItem>
              <SelectItem value="created_utc">Date posted</SelectItem>
              <SelectItem value="fetched_at">Fetched</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort direction */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setConfig({ ...config, sort_dir: config.sort_dir === 'desc' ? 'asc' : 'desc' })
            }
            title={config.sort_dir === 'desc' ? 'Descending' : 'Ascending'}
          >
            {config.sort_dir === 'desc' ? '↓' : '↑'}
          </Button>

          {/* View mode toggle */}
          <div className="flex rounded-md border overflow-hidden">
            {(['columns', 'tabs', 'flat'] as PageViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => saveViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  pageViewMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Flat mode filter bar */}
      {pageViewMode === 'flat' && (
        <div className="flex items-center gap-2 px-6 py-3 border-b flex-wrap">
          <Input
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8"
          />
          <div className="flex items-center gap-1 flex-wrap">
            {availableSubreddits.map((sr) => (
              <Button
                key={sr}
                variant={flatSubreddits.includes(sr) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFlatSubreddit(sr)}
                className="text-xs h-8"
              >
                r/{sr}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading posts...</p>
        ) : visiblePosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No digest posts yet. Run the Reddit Digest script to populate.
          </p>
        ) : pageViewMode === 'columns' ? (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {groupKeys.map((key) => (
              <SubredditColumn key={key} label={key} posts={groups.get(key) ?? []} />
            ))}
          </div>
        ) : pageViewMode === 'tabs' ? (
          <Tabs defaultValue={groupKeys[0]}>
            <TabsList className="mb-4 flex-wrap h-auto">
              {groupKeys.map((key) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  r/{key}
                </TabsTrigger>
              ))}
            </TabsList>
            {groupKeys.map((key) => (
              <TabsContent key={key} value={key}>
                <SubredditColumn label={key} posts={groups.get(key) ?? []} />
              </TabsContent>
            ))}
          </Tabs>
        ) : flatPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts match your filters.</p>
        ) : (
          <div className="max-w-3xl">
            {flatPosts.map((post) => (
              <div key={`${post.post_id}-${post.week_start_date}`}>
                <p className="text-[10px] font-mono text-muted-foreground pt-2 -mb-1">
                  r/{post.subreddit}
                </p>
                <DigestPostRow post={post} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
