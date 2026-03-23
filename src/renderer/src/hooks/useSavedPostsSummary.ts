import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { SavedPostSummary } from '../../../shared/ipc-types'

export function useSavedPostsSummary(): { posts: SavedPostSummary[]; loading: boolean } {
  const [posts, setPosts] = useState<SavedPostSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('reddit:getSavedPostsSummary')
      .then((data) => {
        setPosts(data as SavedPostSummary[])
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Saved Posts summary.')
      })
      .finally(() => setLoading(false))
  }, [])

  return { posts, loading }
}
