import { useState, useEffect, useCallback, useRef } from 'react'
import type { SavedPost } from '../../../shared/ipc-types'
import { IPC, type GetSavedPostsRequest } from '../../../shared/ipc-types'

interface UseSavedPostsOptions {
  limit?: number
  offset?: number
  search?: string
  subreddit?: string | null
  subreddit_filter?: string[] | null
  tag?: string | null
  tag_filter?: string[] | null
  sort_by?: 'saved_at' | 'score'
  sort_dir?: 'asc' | 'desc'
}

interface UseSavedPostsResult {
  posts: SavedPost[]
  total: number
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  search: string
  setSearch: (search: string) => void
  subreddit: string | null
  setSubreddit: (subreddit: string | null) => void
  tag: string | null
  setTag: (tag: string | null) => void
  offset: number
  setOffset: (offset: number) => void
}

export function useSavedPosts(options?: UseSavedPostsOptions): UseSavedPostsResult {
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState(options?.search ?? '')
  const [subreddit, setSubreddit] = useState<string | null>(options?.subreddit ?? null)
  const [tag, setTag] = useState<string | null>(options?.tag ?? null)
  const [offset, setOffset] = useState(options?.offset ?? 0)

  // Query parameters from options (for widget usage)
  const subredditFilter = options?.subreddit_filter
  const tagFilter = options?.tag_filter
  const sortBy = options?.sort_by ?? 'saved_at'
  const sortDir = options?.sort_dir ?? 'desc'
  const limit = options?.limit ?? 50

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const request: GetSavedPostsRequest = {
        limit,
        offset,
        sort_by: sortBy,
        sort_dir: sortDir
      }

      // Support both old page-style filters and new widget-style filters
      if (search) request.search = search
      if (subreddit) {
        request.subreddit = subreddit
      } else if (subredditFilter) {
        request.subreddit_filter = subredditFilter
      }

      if (tag) {
        request.tag = tag
      } else if (tagFilter) {
        request.tag_filter = tagFilter
      }

      const result = (await window.api.invoke(IPC.REDDIT_GET_SAVED_POSTS, request)) as {
        posts: SavedPost[]
        total: number
      }
      setPosts(result.posts)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved posts')
    } finally {
      setLoading(false)
    }
  }, [search, subreddit, subredditFilter, tag, tagFilter, sortBy, sortDir, limit, offset])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void fetchPosts()
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchPosts])

  // Listen for push events from ntfy ingest
  useEffect(() => {
    const listener = (): void => {
      void fetchPosts()
    }
    window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    return () => {
      window.api.off(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener)
    }
  }, [fetchPosts])

  return {
    posts,
    total,
    loading,
    error,
    refetch: fetchPosts,
    search,
    setSearch: (s: string) => {
      setSearch(s)
      setOffset(0)
    },
    subreddit,
    setSubreddit: (s: string | null) => {
      setSubreddit(s)
      setOffset(0)
    },
    tag,
    setTag: (t: string | null) => {
      setTag(t)
      setOffset(0)
    },
    offset,
    setOffset
  }
}
