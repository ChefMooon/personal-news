import React from 'react'
import type { DigestPost } from '../../../../shared/ipc-types'
import { DigestPostRow } from './DigestPostRow'

interface SubredditColumnProps {
  label: string
  posts: DigestPost[]
}

export function SubredditColumn({ label, posts }: SubredditColumnProps): React.ReactElement {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1 border-b">
        {label === 'All' ? label : `r/${label}`}
      </div>
      <div>
        {posts.map((post) => (
          <DigestPostRow key={post.post_id} post={post} />
        ))}
      </div>
    </div>
  )
}
