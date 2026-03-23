import React, { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC } from '../../../shared/ipc-types'

interface SavedPostsEnabledContextValue {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

const SavedPostsEnabledContext = createContext<SavedPostsEnabledContextValue>({
  enabled: true,
  setEnabled: () => {}
})

export function SavedPostsEnabledProvider({
  children
}: {
  children: React.ReactNode
}): React.ReactElement {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'saved_posts_enabled')
      .then((raw) => {
        if (raw === 'false') {
          setEnabledState(false)
        }
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load Saved Posts feature flag.')
      })
  }, [])

  const setEnabled = (value: boolean): void => {
    setEnabledState(value)
    window.api
      .invoke(IPC.SETTINGS_SET, 'saved_posts_enabled', String(value))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save Saved Posts feature flag.')
      })
  }

  return (
    <SavedPostsEnabledContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </SavedPostsEnabledContext.Provider>
  )
}

export function useSavedPostsEnabled(): SavedPostsEnabledContextValue {
  return useContext(SavedPostsEnabledContext)
}
