import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC } from '../../../../shared/ipc-types'
import type { DigestPost } from '../../../../shared/ipc-types'
import { formatRelativeTime } from '../../lib/time'
import { MessageSquare, ArrowUp, Circle, CircleCheck } from 'lucide-react'

interface DigestPostRowProps {
  post: DigestPost
}

export function DigestPostRow({ post }: DigestPostRowProps): React.ReactElement {
  const [viewedAt, setViewedAt] = useState<number | null>(post.viewed_at)

  useEffect(() => {
    setViewedAt(post.viewed_at)
  }, [post.viewed_at])

  const setViewed = (nextViewed: boolean): void => {
    const optimisticViewedAt = nextViewed ? Math.floor(Date.now() / 1000) : null
    const prev = viewedAt
    setViewedAt(optimisticViewedAt)
    window.api
      .invoke(IPC.REDDIT_SET_DIGEST_POST_VIEWED, post.post_id, post.week_start_date, nextViewed)
      .then((result) => {
        const mutation = result as { ok: boolean; error: string | null }
        if (!mutation.ok) {
          setViewedAt(prev)
          toast.error(mutation.error ?? 'Failed to update viewed state.')
        }
      })
      .catch((err) => {
        setViewedAt(prev)
        toast.error(err instanceof Error ? err.message : 'Failed to update viewed state.')
      })
  }

  const handleClick = (): void => {
    const url = `https://reddit.com${post.permalink}`
    if (!viewedAt) {
      setViewed(true)
    }
    window.api.invoke('shell:openExternal', url).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to open Reddit post.')
    })
  }

  const isViewed = viewedAt !== null

  return (
    <div className="h-20 py-1 border-b last:border-0 overflow-hidden flex flex-col">
      <div className="flex items-start gap-2 flex-1">
      <button
        type="button"
        onClick={handleClick}
        className="text-left w-full group cursor-pointer flex-1 flex flex-col justify-between"
        aria-label={`Open post: ${post.title}`}
      >
        <p
          className={`text-sm font-medium group-hover:text-primary transition-colors line-clamp-2 leading-snug ${
            isViewed ? 'text-foreground/70' : ''
          }`}
        >
          {post.title}
        </p>
        <div className={`flex items-center gap-3 mt-1 text-xs ${isViewed ? 'text-muted-foreground/80' : 'text-muted-foreground'}`}>
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
      <button
        type="button"
        onClick={() => setViewed(!isViewed)}
        className="mt-0.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={isViewed ? 'Mark post as unviewed' : 'Mark post as viewed'}
        aria-pressed={isViewed}
        title={isViewed ? 'Viewed - click to mark unviewed' : 'Unviewed - click to mark viewed'}
      >
        {isViewed ? (
          <>
            <CircleCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span className="sr-only">Viewed</span>
          </>
        ) : (
          <>
            <Circle className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Unviewed</span>
          </>
        )}
      </button>
      </div>
    </div>
  )
}
