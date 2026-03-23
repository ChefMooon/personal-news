import { useState, useEffect, useCallback } from 'react'
import { IPC, type DigestPost } from '../../../shared/ipc-types'

export function useRedditDigest(weekStartDate?: string | null): { posts: DigestPost[]; loading: boolean } {
  const [posts, setPosts] = useState<DigestPost[]>([])
  const [loading, setLoading] = useState(true)

  const fetchPosts = useCallback((): void => {
    setLoading(true)
    window.api
      .invoke(IPC.REDDIT_GET_DIGEST_POSTS, weekStartDate ? { week_start_date: weekStartDate } : undefined)
      .then((data) => {
        setPosts(data as DigestPost[])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [weekStartDate])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    const unsubscribe = window.api.on(IPC.REDDIT_UPDATED, () => {
      fetchPosts()
    })
    return unsubscribe
  }, [fetchPosts])

  return { posts, loading }
}
