import React from 'react'

export default function SavedPosts(): React.ReactElement {
  return (
    <div className="flex flex-col h-full px-6 py-4">
      <h1 className="text-xl font-semibold mb-4">Saved Posts</h1>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground text-sm">Full saved posts view coming soon.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Search, filter, and tag management will be available here.
          </p>
        </div>
      </div>
    </div>
  )
}
