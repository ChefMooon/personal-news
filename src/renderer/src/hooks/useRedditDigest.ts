import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { IPC, type DigestPost, type DigestViewedChangedEvent } from '../../../shared/ipc-types'

export function useRedditDigest(
  weekStartDate?: string | null,
  hideViewed = false
): { posts: DigestPost[]; loading: boolean } {
  const [posts, setPosts] = useState<DigestPost[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPosts = useCallback((options?: { silent?: boolean }): void => {
    const silent = options?.silent ?? false
    if (!silent) {
      setLoading(true)
    }

    window.api
      .invoke(
        IPC.REDDIT_GET_DIGEST_POSTS,
        weekStartDate || hideViewed
          ? { week_start_date: weekStartDate, hide_viewed: hideViewed }
          : undefined
      )
      .then((data) => {
        setPosts(data as DigestPost[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Reddit Digest posts.')
      })
      .finally(() => {
        if (!silent) {
          setLoading(false)
        }
      })
  }, [hideViewed, weekStartDate])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    const unsubscribe = window.api.on(IPC.REDDIT_UPDATED, () => {
      fetchPosts({ silent: true })
    })
    return unsubscribe
  }, [fetchPosts])

  useEffect(() => {
    const unsubscribe = window.api.on(IPC.REDDIT_DIGEST_VIEWED_CHANGED, (...args: unknown[]) => {
      const event = args[0] as DigestViewedChangedEvent
      setPosts((prev) => {
        const next = prev
          .map((post) =>
            post.post_id === event.post_id && post.week_start_date === event.week_start_date
              ? { ...post, viewed_at: event.viewed_at }
              : post
          )
          .filter((post) => !(hideViewed && post.viewed_at !== null))
        return next
      })

      // If hide-viewed is enabled and an item is marked unviewed in another surface,
      // perform a silent refetch to bring it back into this list.
      if (hideViewed && event.viewed_at === null) {
        fetchPosts({ silent: true })
      }
    })

    return unsubscribe
  }, [fetchPosts, hideViewed])

  return { posts, loading }
}
