import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import Dashboard from './routes/Dashboard'
import SavedPosts from './routes/SavedPosts'
import ScriptManager from './routes/ScriptManager'
import Settings from './routes/Settings'

export default function App(): React.ReactElement {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/saved-posts" element={<SavedPosts />} />
          <Route path="/scripts" element={<ScriptManager />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
