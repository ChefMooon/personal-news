import { useState, useEffect } from 'react'
import type { DigestPost } from '../../../shared/ipc-types'

export function useRedditDigest(): { posts: DigestPost[]; loading: boolean } {
  const [posts, setPosts] = useState<DigestPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('reddit:getDigestPosts')
      .then((data) => {
        setPosts(data as DigestPost[])
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  return { posts, loading }
}
