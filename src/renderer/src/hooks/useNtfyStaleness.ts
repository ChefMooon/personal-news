import { useState, useEffect } from 'react'
import type { NtfyStaleness } from '../../../shared/ipc-types'
import { IPC } from '../../../shared/ipc-types'

export function useNtfyStaleness(): NtfyStaleness & { loading: boolean; refetch: () => void } {
  const [data, setData] = useState<NtfyStaleness>({
    lastPolledAt: null,
    isStale: false,
    topicConfigured: false
  })
  const [loading, setLoading] = useState(true)

  const fetch = (): void => {
    setLoading(true)
    window.api
      .invoke(IPC.REDDIT_GET_NTFY_STALENESS)
      .then((result) => {
        setData(result as NtfyStaleness)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetch()
  }, [])

  return { ...data, loading, refetch: fetch }
}
