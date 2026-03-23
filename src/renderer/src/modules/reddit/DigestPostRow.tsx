import React from 'react'
import { toast } from 'sonner'
import type { DigestPost } from '../../../../shared/ipc-types'
import { formatRelativeTime } from '../../lib/time'
import { MessageSquare, ArrowUp } from 'lucide-react'

interface DigestPostRowProps {
  post: DigestPost
}

export function DigestPostRow({ post }: DigestPostRowProps): React.ReactElement {
  const handleClick = (): void => {
    const url = `https://reddit.com${post.permalink}`
    window.api.invoke('shell:openExternal', url).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to open Reddit post.')
    })
  }

  return (
    <div className="h-20 py-1 border-b last:border-0 overflow-hidden flex flex-col">
      <button
        onClick={handleClick}
        className="text-left w-full group cursor-pointer flex-1 flex flex-col justify-between"
      >
        <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-2 leading-snug">
          {post.title}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" />
            {post.score?.toLocaleString() ?? '—'}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {post.num_comments?.toLocaleString() ?? '—'}
          </span>
          <span>{formatRelativeTime(post.created_utc)}</span>
        </div>
      </button>
    </div>
  )
}
