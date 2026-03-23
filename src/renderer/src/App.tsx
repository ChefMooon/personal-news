import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import Dashboard from './routes/Dashboard'
import SavedPosts from './routes/SavedPosts'
import YouTubePage from './routes/YouTube'
import RedditDigest from './routes/RedditDigest'
import ScriptManager from './routes/ScriptManager'
import Settings from './routes/Settings'
import { RedditDigestEnabledProvider } from './contexts/RedditDigestEnabledContext'
import { SavedPostsEnabledProvider } from './contexts/SavedPostsEnabledContext'
import { Toaster, toast } from 'sonner'
import { IPC } from '../../shared/ipc-types'

export default function App(): React.ReactElement {
  React.useEffect(() => {
    return window.api.on(IPC.APP_SHOW_TRAY_HINT, () => {
      toast.info('Personal News is still running in the system tray.', {
        description: 'Use the tray icon to reopen the app or quit it completely.',
        duration: 5000
      })
    })
  }, [])

  return (
    <RedditDigestEnabledProvider>
      <SavedPostsEnabledProvider>
        <div className="flex h-screen w-screen overflow-hidden bg-background">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/reddit-digest" element={<RedditDigest />} />
              <Route path="/saved-posts" element={<SavedPosts />} />
              <Route path="/youtube" element={<YouTubePage />} />
              <Route path="/scripts" element={<ScriptManager />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
        <Toaster
          position="bottom-right"
          richColors
          containerAriaLabel="Notifications"
          toastOptions={{ closeButtonAriaLabel: 'Close notification' }}
        />
      </SavedPostsEnabledProvider>
    </RedditDigestEnabledProvider>
  )
}
