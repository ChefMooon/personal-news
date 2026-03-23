import { useCallback, useEffect, useState } from 'react'
import { IPC, type DigestWeekSummary } from '../../../shared/ipc-types'

export function useRedditDigestWeeks(): { weeks: DigestWeekSummary[]; loading: boolean } {
  const [weeks, setWeeks] = useState<DigestWeekSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchWeeks = useCallback((): void => {
    setLoading(true)
    window.api
      .invoke(IPC.REDDIT_GET_DIGEST_WEEKS)
      .then((data) => {
        setWeeks(data as DigestWeekSummary[])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchWeeks()
  }, [fetchWeeks])

  useEffect(() => {
    const unsubscribe = window.api.on(IPC.REDDIT_UPDATED, () => {
      fetchWeeks()
    })
    return unsubscribe
  }, [fetchWeeks])

  return { weeks, loading }
}