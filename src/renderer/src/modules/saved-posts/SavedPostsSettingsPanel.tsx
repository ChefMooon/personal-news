import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { Separator } from '../../components/ui/separator'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import type { SavedPostsViewConfig, LinkSource } from '../../../../shared/ipc-types'

const ALL_SOURCES: { value: LinkSource; label: string }[] = [
  { value: 'reddit', label: 'Reddit' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'bsky', label: 'Bluesky' },
  { value: 'generic', label: 'Other Links' }
]

const SOURCE_LABEL_MAP: Record<LinkSource, string> = {
  reddit: 'Reddit',
  x: 'X (Twitter)',
  bsky: 'Bluesky',
  generic: 'Other Links'
}

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {title}
    </h3>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0 pr-1">{children}</div>
    </div>
  )
}

interface SavedPostsSettingsPanelProps {
  config: SavedPostsViewConfig
  availableSubreddits: string[]
  availableTags: string[]
  onChange: (config: SavedPostsViewConfig) => void
}

export function SavedPostsSettingsPanel({
  config,
  availableSubreddits,
  availableTags,
  onChange
}: SavedPostsSettingsPanelProps): React.ReactElement {
  const { instanceId } = useWidgetInstance()
  const [draft, setDraft] = useState<SavedPostsViewConfig>(config)
  const [subredditsExpanded, setSubredditsExpanded] = useState(true)
  const [subredditsExpandedLoaded, setSubredditsExpandedLoaded] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(true)
  const [tagsExpandedLoaded, setTagsExpandedLoaded] = useState(false)

  const subredditsKey = `saved-posts:settings:subredditsExpanded:${instanceId}`
  const tagsKey = `saved-posts:settings:tagsExpanded:${instanceId}`

  useEffect(() => {
    setDraft(config)
  }, [config]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load subredditsExpanded from localStorage
  useEffect(() => {
    if (!instanceId) {
      setSubredditsExpanded(true)
      setSubredditsExpandedLoaded(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(subredditsKey)
      setSubredditsExpanded(raw === 'false' ? false : true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Saved Posts subreddits panel state.')
      setSubredditsExpanded(true)
    } finally {
      setSubredditsExpandedLoaded(true)
    }
  }, [instanceId, subredditsKey])

  // Save subredditsExpanded to localStorage
  useEffect(() => {
    if (!subredditsExpandedLoaded || !instanceId) return
    try {
      window.localStorage.setItem(subredditsKey, String(subredditsExpanded))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Saved Posts subreddits panel state.')
    }
  }, [instanceId, subredditsExpanded, subredditsExpandedLoaded, subredditsKey])

  // Load tagsExpanded from localStorage
  useEffect(() => {
    if (!instanceId) {
      setTagsExpanded(true)
      setTagsExpandedLoaded(true)
      return
    }
    try {
      const raw = window.localStorage.getItem(tagsKey)
      setTagsExpanded(raw === 'false' ? false : true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load Saved Posts tags panel state.')
      setTagsExpanded(true)
    } finally {
      setTagsExpandedLoaded(true)
    }
  }, [instanceId, tagsKey])

  // Save tagsExpanded to localStorage
  useEffect(() => {
    if (!tagsExpandedLoaded || !instanceId) return
    try {
      window.localStorage.setItem(tagsKey, String(tagsExpanded))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save Saved Posts tags panel state.')
    }
  }, [instanceId, tagsExpanded, tagsExpandedLoaded, tagsKey])

  const applyUpdate = (next: SavedPostsViewConfig): void => {
    setDraft(next)
    onChange(next)
  }

  // ── Sources ──────────────────────────────────────────────────────────────
  const sourceMode = draft.source_filter === null ? 'all' : 'selected'
  const selectedSourceCount =
    sourceMode === 'all' ? ALL_SOURCES.length : (draft.source_filter?.length ?? 0)

  const toggleSource = (source: LinkSource): void => {
    const current =
      draft.source_filter !== null ? draft.source_filter : ALL_SOURCES.map((s) => s.value)
    const updated = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source]
    applyUpdate({ ...draft, source_filter: updated })
  }

  // ── Subreddits ────────────────────────────────────────────────────────────
  const visibleSelectedSubreddits = useMemo(
    () => (draft.subreddit_filter ?? []).filter((s) => availableSubreddits.includes(s)),
    [draft.subreddit_filter, availableSubreddits]
  )
  const subredditMode = draft.subreddit_filter === null ? 'all' : 'selected'
  const selectedSubredditCount =
    subredditMode === 'all' ? availableSubreddits.length : visibleSelectedSubreddits.length

  const toggleSubreddit = (subreddit: string): void => {
    const current =
      draft.subreddit_filter !== null ? draft.subreddit_filter : [...availableSubreddits]
    const updated = current.includes(subreddit)
      ? current.filter((s) => s !== subreddit)
      : [...current, subreddit]
    applyUpdate({ ...draft, subreddit_filter: updated })
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  const visibleSelectedTags = useMemo(
    () => (draft.tag_filter ?? []).filter((t) => availableTags.includes(t)),
    [draft.tag_filter, availableTags]
  )
  const tagMode = draft.tag_filter === null ? 'all' : 'selected'
  const selectedTagCount = tagMode === 'all' ? availableTags.length : visibleSelectedTags.length

  const toggleTag = (tag: string): void => {
    const current = draft.tag_filter !== null ? draft.tag_filter : [...availableTags]
    const updated = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    applyUpdate({ ...draft, tag_filter: updated })
  }

  // ── Source reorder ────────────────────────────────────────────────────────
  const moveSource = (source: LinkSource, direction: 'up' | 'down'): void => {
    const order = [...draft.sourceOrder]
    const idx = order.indexOf(source)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= order.length) return
    ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
    applyUpdate({ ...draft, sourceOrder: order })
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 flex-1">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pl-2 pr-4">

          {/* ── Sources ── */}
          <div>
            <SectionHeader title="Sources" />

            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant={sourceMode === 'all' ? 'default' : 'outline'}
                onClick={() => applyUpdate({ ...draft, source_filter: null })}
              >
                All Sources
              </Button>
              <Button
                size="sm"
                variant={sourceMode === 'selected' ? 'default' : 'outline'}
                onClick={() => {
                  if (sourceMode !== 'selected') {
                    applyUpdate({
                      ...draft,
                      source_filter: draft.source_filter ?? ALL_SOURCES.map((s) => s.value)
                    })
                  }
                }}
              >
                Selected Only
              </Button>
            </div>

            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-xs text-muted-foreground">
                {selectedSourceCount} of {ALL_SOURCES.length} shown
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => applyUpdate({ ...draft, source_filter: null })}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => applyUpdate({ ...draft, source_filter: [] })}
                >
                  Deselect all
                </button>
              </div>
            </div>

            <div className="border rounded-md overflow-hidden">
              {ALL_SOURCES.map(({ value, label }) => {
                const isSelected =
                  sourceMode === 'all' || (draft.source_filter?.includes(value) ?? false)
                return (
                  <div
                    key={value}
                    className="flex items-center gap-2 px-2 py-2 hover:bg-accent/40 border-b last:border-0"
                  >
                    <span className="text-sm flex-1">{label}</span>
                    <button
                      type="button"
                      onClick={() => toggleSource(value)}
                      className={cn(
                        'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                        isSelected
                          ? 'bg-primary border-primary'
                          : 'border-input bg-background hover:border-primary/50'
                      )}
                      aria-label={isSelected ? `Deselect ${label}` : `Select ${label}`}
                      aria-pressed={isSelected}
                    >
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* ── Subreddits ── */}
          <div>
            <button
              type="button"
              className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSubredditsExpanded((prev) => !prev)}
              aria-expanded={subredditsExpanded}
              aria-controls="saved-posts-settings-subreddits"
            >
              {subredditsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Subreddits
            </button>

            {subredditsExpanded && (
              <div id="saved-posts-settings-subreddits">
                {availableSubreddits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No subreddits yet</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        variant={subredditMode === 'all' ? 'default' : 'outline'}
                        onClick={() => applyUpdate({ ...draft, subreddit_filter: null })}
                      >
                        All Subreddits
                      </Button>
                      <Button
                        size="sm"
                        variant={subredditMode === 'selected' ? 'default' : 'outline'}
                        onClick={() => {
                          if (subredditMode !== 'selected') {
                            applyUpdate({
                              ...draft,
                              subreddit_filter:
                                visibleSelectedSubreddits.length > 0
                                  ? visibleSelectedSubreddits
                                  : [...availableSubreddits]
                            })
                          }
                        }}
                      >
                        Selected Only
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedSubredditCount} of {availableSubreddits.length} shown
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => applyUpdate({ ...draft, subreddit_filter: null })}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => applyUpdate({ ...draft, subreddit_filter: [] })}
                        >
                          Deselect all
                        </button>
                      </div>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      {availableSubreddits.map((subreddit) => {
                        const isSelected =
                          subredditMode === 'all' ||
                          visibleSelectedSubreddits.includes(subreddit)
                        return (
                          <div
                            key={subreddit}
                            className="flex items-center gap-2 px-2 py-2 hover:bg-accent/40 border-b last:border-0"
                          >
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-medium text-muted-foreground">
                                r/
                              </span>
                            </div>
                            <span className="text-sm flex-1 truncate min-w-0">
                              r/{subreddit}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleSubreddit(subreddit)}
                              className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                isSelected
                                  ? 'bg-primary border-primary'
                                  : 'border-input bg-background hover:border-primary/50'
                              )}
                              aria-label={
                                isSelected
                                  ? `Deselect r/${subreddit}`
                                  : `Select r/${subreddit}`
                              }
                              aria-pressed={isSelected}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5">
                      Filter posts by subreddit · Pinned sources appear first
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* ── Tags ── */}
          <div>
            <button
              type="button"
              className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setTagsExpanded((prev) => !prev)}
              aria-expanded={tagsExpanded}
              aria-controls="saved-posts-settings-tags"
            >
              {tagsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Tags
            </button>

            {tagsExpanded && (
              <div id="saved-posts-settings-tags">
                {availableTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No tags yet</p>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      <Button
                        size="sm"
                        variant={tagMode === 'all' ? 'default' : 'outline'}
                        onClick={() => applyUpdate({ ...draft, tag_filter: null })}
                      >
                        All Tags
                      </Button>
                      <Button
                        size="sm"
                        variant={tagMode === 'selected' ? 'default' : 'outline'}
                        onClick={() => {
                          if (tagMode !== 'selected') {
                            applyUpdate({
                              ...draft,
                              tag_filter:
                                visibleSelectedTags.length > 0
                                  ? visibleSelectedTags
                                  : [...availableTags]
                            })
                          }
                        }}
                      >
                        Selected Only
                      </Button>
                    </div>

                    <div className="flex items-center justify-between gap-3 mb-2">
                      <p className="text-xs text-muted-foreground">
                        {selectedTagCount} of {availableTags.length} shown
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => applyUpdate({ ...draft, tag_filter: null })}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => applyUpdate({ ...draft, tag_filter: [] })}
                        >
                          Deselect all
                        </button>
                      </div>
                    </div>

                    <div className="border rounded-md overflow-hidden">
                      {availableTags.map((tag) => {
                        const isSelected =
                          tagMode === 'all' || visibleSelectedTags.includes(tag)
                        return (
                          <div
                            key={tag}
                            className="flex items-center gap-2 px-2 py-2 hover:bg-accent/40 border-b last:border-0"
                          >
                            <span className="text-sm flex-1 truncate min-w-0">{tag}</span>
                            <button
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                isSelected
                                  ? 'bg-primary border-primary'
                                  : 'border-input bg-background hover:border-primary/50'
                              )}
                              aria-label={isSelected ? `Deselect ${tag}` : `Select ${tag}`}
                              aria-pressed={isSelected}
                            >
                              {isSelected && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1.5">
                      Filter posts by tag
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* ── Sorting ── */}
          <div>
            <SectionHeader title="Sorting" />
            <div className="space-y-0.5">
              <SettingRow label="Sort by">
                <Select
                  value={draft.sort_by}
                  onValueChange={(val) =>
                    applyUpdate({ ...draft, sort_by: val as 'saved_at' | 'score' })
                  }
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs" aria-label="Sort by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saved_at">Date Saved</SelectItem>
                    <SelectItem value="score">Score</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Sort direction">
                <Select
                  value={draft.sort_dir}
                  onValueChange={(val) =>
                    applyUpdate({ ...draft, sort_dir: val as 'asc' | 'desc' })
                  }
                >
                  <SelectTrigger className="w-[130px] h-8 text-xs" aria-label="Sort direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">
                      {draft.sort_by === 'saved_at' ? 'Newest first' : 'Highest first'}
                    </SelectItem>
                    <SelectItem value="asc">
                      {draft.sort_by === 'saved_at' ? 'Oldest first' : 'Lowest first'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              <SettingRow label="Max posts">
                <Select
                  value={draft.max_posts.toString()}
                  onValueChange={(val) => applyUpdate({ ...draft, max_posts: parseInt(val, 10) })}
                >
                  <SelectTrigger className="w-[80px] h-8 text-xs" aria-label="Max posts">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </div>
          </div>

          <Separator />

          {/* ── Grouping ── */}
          <div>
            <SectionHeader title="Grouping" />
            <div className="space-y-0.5">
              <SettingRow label="Group by">
                <Select
                  value={draft.group_by}
                  onValueChange={(val) =>
                    applyUpdate({ ...draft, group_by: val as 'none' | 'source' })
                  }
                >
                  <SelectTrigger className="w-[150px] h-8 text-xs" aria-label="Group by">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Grouping</SelectItem>
                    <SelectItem value="source">Group by Source</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>

              {draft.group_by === 'source' && (
                <>
                  <SettingRow label="Show group headers">
                    <Switch
                      checked={draft.showGroupHeaders}
                      aria-label="Show group headers"
                      onCheckedChange={(checked) =>
                        applyUpdate({ ...draft, showGroupHeaders: checked })
                      }
                    />
                  </SettingRow>

                  <div className="pt-1">
                    <p className="text-xs text-muted-foreground mb-2">Source order</p>
                    <div className="space-y-1">
                      {draft.sourceOrder.map((source, idx) => (
                        <div
                          key={source}
                          className="flex items-center gap-2 px-2 py-1.5 rounded border bg-muted/30 text-sm"
                        >
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1">{SOURCE_LABEL_MAP[source]}</span>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveSource(source, 'up')}
                            className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                            aria-label={`Move ${SOURCE_LABEL_MAP[source]} up`}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === draft.sourceOrder.length - 1}
                            onClick={() => moveSource(source, 'down')}
                            className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                            aria-label={`Move ${SOURCE_LABEL_MAP[source]} down`}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* ── Display ── */}
          <div>
            <SectionHeader title="Display" />
            <div className="space-y-0.5">
              <SettingRow label="Show metadata">
                <Switch
                  checked={draft.showMetadata}
                  aria-label="Show metadata"
                  onCheckedChange={(checked) => applyUpdate({ ...draft, showMetadata: checked })}
                />
              </SettingRow>

              <SettingRow label="Show source badge">
                <Switch
                  checked={draft.showSourceBadge}
                  aria-label="Show source badge"
                  onCheckedChange={(checked) =>
                    applyUpdate({ ...draft, showSourceBadge: checked })
                  }
                />
              </SettingRow>

              <SettingRow label="Show link URL">
                <Switch
                  checked={draft.showUrl}
                  aria-label="Show link URL"
                  onCheckedChange={(checked) => applyUpdate({ ...draft, showUrl: checked })}
                />
              </SettingRow>

              <SettingRow label="Show body preview">
                <Switch
                  checked={draft.showBodyPreview}
                  aria-label="Show body preview"
                  onCheckedChange={(checked) =>
                    applyUpdate({ ...draft, showBodyPreview: checked })
                  }
                />
              </SettingRow>

              <SettingRow label="Compact view">
                <Switch
                  checked={draft.cardDensity === 'compact'}
                  aria-label="Compact view"
                  onCheckedChange={(checked) =>
                    applyUpdate({ ...draft, cardDensity: checked ? 'compact' : 'detailed' })
                  }
                />
              </SettingRow>

              <SettingRow label='Show "View All" link'>
                <Switch
                  checked={draft.showViewAllLink}
                  aria-label="Show View All link"
                  onCheckedChange={(checked) =>
                    applyUpdate({ ...draft, showViewAllLink: checked })
                  }
                />
              </SettingRow>

              <SettingRow
                label="Hide viewed posts"
                description="Only show posts that are not marked viewed"
              >
                <Switch
                  checked={draft.hideViewed}
                  aria-label="Hide viewed posts"
                  onCheckedChange={(checked) =>
                    applyUpdate({ ...draft, hideViewed: checked })
                  }
                />
              </SettingRow>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}
