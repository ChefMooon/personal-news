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
import { Toaster } from 'sonner'

export default function App(): React.ReactElement {
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
        <Toaster position="bottom-right" richColors />
      </SavedPostsEnabledProvider>
    </RedditDigestEnabledProvider>
  )
}
