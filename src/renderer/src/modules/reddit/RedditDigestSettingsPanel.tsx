import React, { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Check,
  ChevronDown,
  ChevronRight,
  GripVertical,
  LayoutGrid,
  List,
  Pin,
  Rows3,
  SquareStack
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Separator } from '../../components/ui/separator'
import { Button } from '../../components/ui/button'
import { cn } from '../../lib/utils'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import type { DigestViewConfig, DigestWeekSummary } from '../../../../shared/ipc-types'

interface RedditDigestSettingsPanelProps {
  config: DigestViewConfig
  availableSubreddits: string[]
  availableWeeks: DigestWeekSummary[]
  onChange: (config: DigestViewConfig) => void
}

const WEEK_RANGE_OPTIONS = [2, 4, 8, 12]

const SORT_OPTIONS: { value: DigestViewConfig['sort_by']; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'num_comments', label: 'Comments' },
  { value: 'created_utc', label: 'Age' },
  { value: 'fetched_at', label: 'Date Collected' }
]

interface SortableSubredditRowProps {
  subreddit: string
  showSelect: boolean
  isSelected: boolean
  isPinned: boolean
  onToggleSelect: () => void
  onTogglePin: () => void
}

function SortableSubredditRow({
  subreddit,
  showSelect,
  isSelected,
  isPinned,
  onToggleSelect,
  onTogglePin
}: SortableSubredditRowProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subreddit
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-2 hover:bg-accent/40 border-b last:border-0"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
        <span className="text-[10px] font-medium text-muted-foreground">r/</span>
      </div>

      <span className="text-sm flex-1 truncate min-w-0">r/{subreddit}</span>

      <button
        onClick={onTogglePin}
        className={cn(
          'p-1 rounded transition-colors shrink-0',
          isPinned
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title={isPinned ? 'Unpin subreddit' : 'Pin to top'}
        aria-label={isPinned ? `Unpin r/${subreddit}` : `Pin r/${subreddit} to top`}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>

      {showSelect && (
        <button
          onClick={onToggleSelect}
          className={cn(
            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
            isSelected
              ? 'bg-primary border-primary'
              : 'border-input bg-background hover:border-primary/50'
          )}
          aria-label={isSelected ? `Deselect r/${subreddit}` : `Select r/${subreddit}`}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
        </button>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }): React.ReactElement {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {title}
    </h3>
  )
}

export function RedditDigestSettingsPanel({
  config,
  availableSubreddits,
  availableWeeks,
  onChange
}: RedditDigestSettingsPanelProps): React.ReactElement {
  const { instanceId } = useWidgetInstance()
  const [draft, setDraft] = useState<DigestViewConfig>(config)
  const [subredditsExpanded, setSubredditsExpanded] = useState(true)
  const [subredditsExpandedLoaded, setSubredditsExpandedLoaded] = useState(false)

  const subredditsExpandedStorageKey = `reddit-digest:settings:subredditsExpanded:${instanceId}`

  useEffect(() => {
    setDraft(config)
  }, [config])

  useEffect(() => {
    if (!instanceId) {
      setSubredditsExpanded(true)
      setSubredditsExpandedLoaded(true)
      return
    }

    try {
      const raw = window.localStorage.getItem(subredditsExpandedStorageKey)
      if (raw === 'true' || raw === 'false') {
        setSubredditsExpanded(raw === 'true')
      } else {
        setSubredditsExpanded(true)
      }
    } catch (error) {
      console.error('Failed to load Reddit Digest subreddits panel state', error)
      setSubredditsExpanded(true)
    } finally {
      setSubredditsExpandedLoaded(true)
    }
  }, [instanceId, subredditsExpandedStorageKey])

  useEffect(() => {
    if (!subredditsExpandedLoaded || !instanceId) {
      return
    }

    try {
      window.localStorage.setItem(subredditsExpandedStorageKey, String(subredditsExpanded))
    } catch (error) {
      console.error('Failed to persist Reddit Digest subreddits panel state', error)
    }
  }, [instanceId, subredditsExpanded, subredditsExpandedLoaded, subredditsExpandedStorageKey])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const applyUpdate = (next: DigestViewConfig): void => {
    setDraft(next)
    onChange(next)
  }

  const updateConfig = (partial: Partial<DigestViewConfig>): void => {
    applyUpdate({ ...draft, ...partial })
  }

  const handleWeekModeChange = (value: DigestViewConfig['week_mode']): void => {
    updateConfig({
      week_mode: value,
      selected_week:
        value === 'specific'
          ? draft.selected_week ?? availableWeeks[0]?.week_start_date ?? null
          : draft.selected_week
    })
  }

  const orderedSubreddits = useMemo(() => {
    const subredditMap = new Map(availableSubreddits.map((subreddit) => [subreddit, subreddit]))
    const inOrder = draft.subreddit_order
      .map((subreddit) => subredditMap.get(subreddit))
      .filter((subreddit): subreddit is string => subreddit !== undefined)
    const seen = new Set(inOrder)
    const rest = availableSubreddits.filter((subreddit) => !seen.has(subreddit))
    return [...inOrder, ...rest]
  }, [availableSubreddits, draft.subreddit_order])

  const visibleSelectedSubreddits = useMemo(
    () => draft.selected_subreddits.filter((subreddit) => availableSubreddits.includes(subreddit)),
    [availableSubreddits, draft.selected_subreddits]
  )

  const selectedSubredditCount = draft.subreddit_mode === 'all'
    ? availableSubreddits.length
    : visibleSelectedSubreddits.length

  function handleSubredditDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = orderedSubreddits.findIndex((subreddit) => subreddit === active.id)
    const newIndex = orderedSubreddits.findIndex((subreddit) => subreddit === over.id)
    const subredditOrder = arrayMove(orderedSubreddits, oldIndex, newIndex)
    applyUpdate({ ...draft, subreddit_order: subredditOrder })
  }

  function setSubredditMode(mode: DigestViewConfig['subreddit_mode']): void {
    if (mode === 'all') {
      applyUpdate({ ...draft, subreddit_mode: 'all' })
      return
    }

    applyUpdate({
      ...draft,
      subreddit_mode: 'selected',
      selected_subreddits:
        visibleSelectedSubreddits.length > 0 ? visibleSelectedSubreddits : [...availableSubreddits]
    })
  }

  function toggleSubredditSelected(subreddit: string): void {
    const selected = new Set(visibleSelectedSubreddits)
    if (selected.has(subreddit)) {
      selected.delete(subreddit)
    } else {
      selected.add(subreddit)
    }

    applyUpdate({
      ...draft,
      subreddit_mode: 'selected',
      selected_subreddits: Array.from(selected)
    })
  }

  function toggleSubredditPinned(subreddit: string): void {
    const pinned = new Set(draft.pinned_subreddits)
    if (pinned.has(subreddit)) {
      pinned.delete(subreddit)
    } else {
      pinned.add(subreddit)
    }

    applyUpdate({ ...draft, pinned_subreddits: Array.from(pinned) })
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 flex-1">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pr-4">
          <div>
            <button
              className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSubredditsExpanded((prev) => !prev)}
              aria-expanded={subredditsExpanded}
              aria-controls="reddit-digest-settings-subreddits"
            >
              {subredditsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Subreddits
            </button>

            {subredditsExpanded && (
              <div id="reddit-digest-settings-subreddits">
                <div className="flex gap-2 mb-3">
                  <Button
                    size="sm"
                    variant={draft.subreddit_mode === 'all' ? 'default' : 'outline'}
                    onClick={() => setSubredditMode('all')}
                  >
                    All Subreddits
                  </Button>
                  <Button
                    size="sm"
                    variant={draft.subreddit_mode === 'selected' ? 'default' : 'outline'}
                    onClick={() => setSubredditMode('selected')}
                  >
                    Selected Only
                  </Button>
                </div>

                <SectionHeader title="Selection" />
                <div className="flex items-center justify-between gap-3 mb-3">
                  <p className="text-xs text-muted-foreground">
                    {selectedSubredditCount} of {availableSubreddits.length} shown
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => applyUpdate({ ...draft, subreddit_mode: 'selected', selected_subreddits: [...availableSubreddits] })}
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => applyUpdate({ ...draft, subreddit_mode: 'selected', selected_subreddits: [] })}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                <div
                  className="border rounded-md overflow-hidden"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {orderedSubreddits.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3">No subreddits available for the current view.</p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleSubredditDragEnd}
                    >
                      <SortableContext
                        items={orderedSubreddits}
                        strategy={verticalListSortingStrategy}
                      >
                        {orderedSubreddits.map((subreddit) => (
                          <SortableSubredditRow
                            key={subreddit}
                            subreddit={subreddit}
                            showSelect={draft.subreddit_mode === 'selected'}
                            isSelected={visibleSelectedSubreddits.includes(subreddit)}
                            isPinned={draft.pinned_subreddits.includes(subreddit)}
                            onToggleSelect={() => toggleSubredditSelected(subreddit)}
                            onTogglePin={() => toggleSubredditPinned(subreddit)}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Drag to reorder · Pinned subreddits appear first in the widget
                </p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Time Range</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-2">Week Mode</label>
                <Select value={config.week_mode} onValueChange={(value) => handleWeekModeChange(value as DigestViewConfig['week_mode'])}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest" className="text-sm">Latest Week</SelectItem>
                    <SelectItem value="range" className="text-sm">Last N Weeks</SelectItem>
                    <SelectItem value="specific" className="text-sm">Specific Week</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Choose the digest window this widget should preview.
                </p>
              </div>

              {config.week_mode === 'range' && (
                <div>
                  <label className="text-sm block mb-2">Weeks to Show</label>
                  <Select
                    value={String(draft.week_range_count)}
                    onValueChange={(value) => updateConfig({ week_range_count: Number.parseInt(value, 10) })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEK_RANGE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)} className="text-sm">
                          Last {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {draft.week_mode === 'specific' && (
                <div>
                  <label className="text-sm block mb-2">Week</label>
                  {availableWeeks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No digest weeks available yet</p>
                  ) : (
                    <Select
                      value={draft.selected_week ?? availableWeeks[0]?.week_start_date}
                      onValueChange={(value) => updateConfig({ selected_week: value })}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWeeks.map((week) => (
                          <SelectItem key={week.week_start_date} value={week.week_start_date} className="text-sm">
                            {week.week_start_date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Display</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-2">Layout</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={draft.layout_mode === 'columns' ? 'default' : 'outline'}
                    className="h-8 justify-start gap-2 text-sm"
                    onClick={() => updateConfig({ layout_mode: 'columns' })}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Columns
                  </Button>
                  <Button
                    type="button"
                    variant={draft.layout_mode === 'tabs' ? 'default' : 'outline'}
                    className="h-8 justify-start gap-2 text-sm"
                    onClick={() => updateConfig({ layout_mode: 'tabs' })}
                  >
                    <List className="h-3.5 w-3.5" />
                    Tabs
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Columns show everything at once. Tabs reduce horizontal clutter.
                </p>
              </div>

              <div>
                <label className="text-sm block mb-2">Grouping</label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={draft.group_by === 'subreddit' ? 'default' : 'outline'}
                    className="h-8 justify-start gap-2 text-sm"
                    onClick={() => updateConfig({ group_by: 'subreddit' })}
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                    By Subreddit
                  </Button>
                  <Button
                    type="button"
                    variant={draft.group_by === 'none' ? 'default' : 'outline'}
                    className="h-8 justify-start gap-2 text-sm"
                    onClick={() => updateConfig({ group_by: 'none' })}
                  >
                    <SquareStack className="h-3.5 w-3.5" />
                    All Posts
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Group posts into subreddit buckets or flatten them into one feed.
                </p>
              </div>

              <div>
                <label className="text-sm block mb-2">Posts per Group</label>
                <Select
                  value={String(draft.max_posts_per_group)}
                  onValueChange={(value) => updateConfig({ max_posts_per_group: Number.parseInt(value, 10) })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 25].map((option) => (
                      <SelectItem key={option} value={String(option)} className="text-sm">
                        {option} posts
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Controls how many posts show before pagination appears.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Sorting</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-2">Sort By</label>
                <Select
                  value={draft.sort_by}
                  onValueChange={(value) => updateConfig({ sort_by: value as DigestViewConfig['sort_by'] })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-sm">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm block mb-2">Sort Direction</label>
                <Select
                  value={draft.sort_dir}
                  onValueChange={(value) => updateConfig({ sort_dir: value as DigestViewConfig['sort_dir'] })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc" className="text-sm">Descending</SelectItem>
                    <SelectItem value="asc" className="text-sm">Ascending</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Applies before grouping so each column or tab keeps the same ranking logic.
                </p>
              </div>
            </div>
          </div>

        </div>
      </ScrollArea>
    </div>
  )
}