import { useState, useEffect } from 'react'
import type { SavedPostSummary } from '../../../shared/ipc-types'

export function useSavedPostsSummary(): { posts: SavedPostSummary[]; loading: boolean } {
  const [posts, setPosts] = useState<SavedPostSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('reddit:getSavedPostsSummary')
      .then((data) => {
        setPosts(data as SavedPostSummary[])
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  return { posts, loading }
}
