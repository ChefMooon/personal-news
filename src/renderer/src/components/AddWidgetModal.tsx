import React, { useState, useEffect, useMemo } from 'react'
import { X, ArrowLeft, Plus, Youtube, Newspaper, Bookmark } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { moduleRegistry } from '../modules/registry'
import { useRedditDigest } from '../hooks/useRedditDigest'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import type { WidgetLayout } from '../../../shared/ipc-types'
import { cn } from '../lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AddWidgetConfig {
  moduleId: string
  label: string | null
  subredditFilter: string[] | null
  position: 'top' | 'bottom' | { afterId: string }
}

interface AddWidgetModalProps {
  layout: WidgetLayout
  onAdd: (config: AddWidgetConfig) => void
  onClose: () => void
}

// ─── Static module metadata ──────────────────────────────────────────────────

const MODULE_META: Record<string, { description: string; icon: React.ReactNode }> = {
  youtube: {
    description: 'Recent videos and live streams from your subscribed channels.',
    icon: <Youtube className="h-7 w-7 text-red-500" />
  },
  reddit_digest: {
    description: 'Top posts from your subreddits, with per-instance filters.',
    icon: <Newspaper className="h-7 w-7 text-orange-400" />
  },
  saved_posts: {
    description: 'Posts saved from Reddit via your ntfy mobile flow.',
    icon: <Bookmark className="h-7 w-7 text-blue-400" />
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AddWidgetModal({ layout, onAdd, onClose }: AddWidgetModalProps): React.ReactElement {
  const [phase, setPhase] = useState<'pick' | 'configure'>('pick')
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [position, setPosition] = useState('bottom')
  const [subredditFilter, setSubredditFilter] = useState<string[] | null>(null)

  const { posts } = useRedditDigest()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  const availableSubreddits = useMemo(
    () => [...new Set(posts.map((p) => p.subreddit))].sort(),
    [posts]
  )

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Build position options from current layout — skip hidden widgets
  const positionOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: 'top', label: 'Top of dashboard' }
    ]
    for (const instanceId of layout.widget_order) {
      if (layout.widget_visibility[instanceId] === false) continue
      const instance = layout.widget_instances[instanceId]
      if (!instance) continue
      const mod = moduleRegistry.find((m) => m.id === instance.moduleId)
      const widgetLabel = instance.label ?? mod?.displayName ?? instanceId
      options.push({ value: `after:${instanceId}`, label: `After "${widgetLabel}"` })
    }
    options.push({ value: 'bottom', label: 'Bottom of dashboard' })
    return options
  }, [layout])

  const selectedMod = moduleRegistry.find((m) => m.id === selectedModuleId)

  // ── Handlers ──────────────────────────────────────────────────────────────

  function selectModule(moduleId: string): void {
    const mod = moduleRegistry.find((m) => m.id === moduleId)
    setSelectedModuleId(moduleId)
    setName(mod?.displayName ?? '')
    setSubredditFilter(null)
    setPhase('configure')
  }

  function handleAdd(): void {
    if (!selectedModuleId) return
    const defaultName = selectedMod?.displayName ?? ''
    const trimmed = name.trim()

    let pos: AddWidgetConfig['position']
    if (position === 'top') pos = 'top'
    else if (position === 'bottom') pos = 'bottom'
    else pos = { afterId: position.replace('after:', '') }

    onAdd({
      moduleId: selectedModuleId,
      label: trimmed === '' || trimmed === defaultName ? null : trimmed,
      subredditFilter: selectedModuleId === 'reddit_digest' ? subredditFilter : null,
      position: pos
    })
  }

  function toggleSubreddit(sub: string): void {
    if (!subredditFilter) {
      setSubredditFilter(availableSubreddits.filter((s) => s !== sub))
    } else if (subredditFilter.includes(sub)) {
      const next = subredditFilter.filter((s) => s !== sub)
      setSubredditFilter(next.length === 0 ? null : next)
    } else {
      const next = [...subredditFilter, sub]
      setSubredditFilter(next.length === availableSubreddits.length ? null : next)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            {phase === 'configure' && (
              <button
                onClick={() => setPhase('pick')}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="Back to widget list"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold">
              {phase === 'pick' ? 'Add Widget' : `Configure ${selectedMod?.displayName ?? ''}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-5">
          {phase === 'pick' ? (
            <WidgetPicker onSelect={selectModule} savedPostsEnabled={savedPostsEnabled} />
          ) : (
            <ConfigureForm
              moduleId={selectedModuleId!}
              name={name}
              onNameChange={setName}
              defaultName={selectedMod?.displayName ?? ''}
              position={position}
              onPositionChange={setPosition}
              positionOptions={positionOptions}
              subredditFilter={subredditFilter}
              availableSubreddits={availableSubreddits}
              onToggleSubreddit={toggleSubreddit}
              onResetFilter={() => setSubredditFilter(null)}
            />
          )}
        </div>

        {/* Footer */}
        {phase === 'configure' && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t shrink-0">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Widget
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Phase 1: Widget picker ───────────────────────────────────────────────────

function WidgetPicker({ onSelect, savedPostsEnabled }: { onSelect: (id: string) => void; savedPostsEnabled: boolean }): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3">
      {moduleRegistry.map((mod) => {
        // Skip saved_posts widget if feature is disabled
        if (mod.id === 'saved_posts' && !savedPostsEnabled) {
          return null
        }
        const meta = MODULE_META[mod.id]
        return (
          <button
            key={mod.id}
            onClick={() => onSelect(mod.id)}
            className={cn(
              'flex items-center gap-4 p-4 rounded-lg border border-border text-left',
              'hover:border-primary hover:bg-accent transition-colors group'
            )}
          >
            <div className="p-2.5 rounded-lg bg-muted group-hover:bg-background transition-colors shrink-0">
              {meta?.icon ?? <Newspaper className="h-7 w-7 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{mod.displayName}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {meta?.description ?? ''}
              </p>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
          </button>
        )
      })}
    </div>
  )
}

// ─── Phase 2: Configure form ─────────────────────────────────────────────────

interface ConfigureFormProps {
  moduleId: string
  name: string
  onNameChange: (v: string) => void
  defaultName: string
  position: string
  onPositionChange: (v: string) => void
  positionOptions: { value: string; label: string }[]
  subredditFilter: string[] | null
  availableSubreddits: string[]
  onToggleSubreddit: (sub: string) => void
  onResetFilter: () => void
}

function ConfigureForm({
  moduleId,
  name,
  onNameChange,
  defaultName,
  position,
  onPositionChange,
  positionOptions,
  subredditFilter,
  availableSubreddits,
  onToggleSubreddit,
  onResetFilter
}: ConfigureFormProps): React.ReactElement {
  const isReddit = moduleId === 'reddit_digest'

  return (
    <div className="space-y-5">

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Name</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={defaultName}
        />
        <p className="text-xs text-muted-foreground">
          Set the same as the default name to use no custom label.
        </p>
      </div>

      {/* Position */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Position</label>
        <Select value={position} onValueChange={onPositionChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {positionOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Subreddit filter — Reddit Digest only */}
      {isReddit && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Subreddit Filter</label>
            {subredditFilter !== null && (
              <button
                onClick={onResetFilter}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Show all
              </button>
            )}
          </div>

          {availableSubreddits.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                No posts loaded yet — subreddit filters can be configured after adding the widget.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Uncheck subreddits to exclude them from this widget.
              </p>
              <div className="rounded-lg border border-border divide-y divide-border max-h-52 overflow-auto">
                {availableSubreddits.map((sub) => {
                  const checked = !subredditFilter || subredditFilter.includes(sub)
                  return (
                    <label
                      key={sub}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleSubreddit(sub)}
                        className="accent-primary h-3.5 w-3.5"
                      />
                      <span className="text-sm">r/{sub}</span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
