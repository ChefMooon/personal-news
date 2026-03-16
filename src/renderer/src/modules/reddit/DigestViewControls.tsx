import React, { useState, useEffect, useRef } from 'react'
import type { DigestViewConfig } from '../../../../shared/ipc-types'
import { LayoutGrid, List, Filter } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'

interface DigestViewControlsProps {
  config: DigestViewConfig
  onChange: (config: DigestViewConfig) => void
  availableSubreddits: string[]
}

const SORT_OPTIONS: { value: DigestViewConfig['sort_by']; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'num_comments', label: 'Comments' },
  { value: 'created_utc', label: 'Age' },
  { value: 'fetched_at', label: 'Date Collected' }
]

export function DigestViewControls({ config, onChange, availableSubreddits }: DigestViewControlsProps): React.ReactElement {
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return
    function handleClick(e: MouseEvent): void {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [filterOpen])

  function toggleSubreddit(sub: string): void {
    const current = config.subreddit_filter
    let next: string[] | null
    if (!current) {
      next = availableSubreddits.filter((s) => s !== sub)
    } else if (current.includes(sub)) {
      next = current.filter((s) => s !== sub)
      if (next.length === 0) next = null
    } else {
      next = [...current, sub]
      if (next.length === availableSubreddits.length) next = null
    }
    onChange({ ...config, subreddit_filter: next })
  }

  const activeFilterCount = config.subreddit_filter?.length ?? null

  return (
    <div className="flex items-center gap-2">
      {/* Sort select */}
      <Select
        value={config.sort_by}
        onValueChange={(val) =>
          onChange({ ...config, sort_by: val as DigestViewConfig['sort_by'] })
        }
      >
        <SelectTrigger className="h-7 text-xs w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort direction toggle */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() =>
          onChange({ ...config, sort_dir: config.sort_dir === 'desc' ? 'asc' : 'desc' })
        }
      >
        {config.sort_dir === 'desc' ? '↓' : '↑'}
      </Button>

      {/* Layout toggle: columns / tabs */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() =>
          onChange({ ...config, layout_mode: config.layout_mode === 'columns' ? 'tabs' : 'columns' })
        }
        title={config.layout_mode === 'columns' ? 'Switch to tabs' : 'Switch to columns'}
      >
        {config.layout_mode === 'columns' ? (
          <LayoutGrid className="h-3.5 w-3.5" />
        ) : (
          <List className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Subreddit filter */}
      {availableSubreddits.length > 0 && (
        <div className="relative" ref={filterRef}>
          <Button
            variant={activeFilterCount !== null ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs px-2 gap-1"
            onClick={() => setFilterOpen((o) => !o)}
            title="Filter subreddits"
          >
            <Filter className="h-3 w-3" />
            {activeFilterCount !== null ? String(activeFilterCount) : 'All'}
          </Button>

          {filterOpen && (
            <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg p-2 z-50 min-w-[160px]">
              <button
                className="w-full text-left text-xs px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent mb-1"
                onClick={() => onChange({ ...config, subreddit_filter: null })}
              >
                Show all
              </button>
              <div className="border-t border-border mb-1" />
              {availableSubreddits.map((sub) => {
                const checked = !config.subreddit_filter || config.subreddit_filter.includes(sub)
                return (
                  <label
                    key={sub}
                    className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSubreddit(sub)}
                      className="accent-primary"
                    />
                    <span className="text-foreground">r/{sub}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
