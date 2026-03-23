import React, { useEffect, useState } from 'react'
import type { DigestPost } from '../../../../shared/ipc-types'
import { DigestPostRow } from './DigestPostRow'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface SubredditColumnProps {
  label: string
  posts: DigestPost[]
  maxPosts?: number
}

export function SubredditColumn({ label, posts, maxPosts }: SubredditColumnProps): React.ReactElement {
  const [currentPage, setCurrentPage] = useState(0)

  // Reset page to 0 when posts reference changes (from sorting/filtering)
  useEffect(() => {
    setCurrentPage(0)
  }, [posts])

  // Compute pagination
  const itemsPerPage = maxPosts ?? posts.length
  const totalPages = itemsPerPage > 0 ? Math.ceil(posts.length / itemsPerPage) : 1
  const pagedPosts = posts.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)

  const handlePrev = (): void => {
    setCurrentPage((page) => Math.max(0, page - 1))
  }

  const handleNext = (): void => {
    setCurrentPage((page) => Math.min(totalPages - 1, page + 1))
  }

  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1 border-b">
        {label === 'All' ? label : `r/${label}`}
      </div>
      <div>
        {pagedPosts.map((post) => (
          <DigestPostRow key={post.post_id} post={post} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3 pt-2 border-t text-xs text-muted-foreground">
          <button
            onClick={handlePrev}
            disabled={currentPage === 0}
            className="p-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent rounded transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums text-sm font-medium">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={currentPage === totalPages - 1}
            className="p-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent rounded transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
