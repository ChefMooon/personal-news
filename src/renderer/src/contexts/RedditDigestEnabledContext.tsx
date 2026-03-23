import React, { createContext, useContext, useEffect, useState } from 'react'
import { IPC } from '../../../shared/ipc-types'

interface RedditDigestEnabledContextValue {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

const RedditDigestEnabledContext = createContext<RedditDigestEnabledContextValue>({
  enabled: true,
  setEnabled: () => {}
})

export function RedditDigestEnabledProvider({
  children
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'reddit_digest_enabled')
      .then((raw) => {
        if (raw === 'false') {
          setEnabledState(false)
        }
      })
      .catch(console.error)
  }, [])

  const setEnabled = (value: boolean): void => {
    setEnabledState(value)
    window.api
      .invoke(IPC.SETTINGS_SET, 'reddit_digest_enabled', String(value))
      .catch(console.error)
  }

  return (
    <RedditDigestEnabledContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </RedditDigestEnabledContext.Provider>
  )
}

export function useRedditDigestEnabled(): RedditDigestEnabledContextValue {
  return useContext(RedditDigestEnabledContext)
}
