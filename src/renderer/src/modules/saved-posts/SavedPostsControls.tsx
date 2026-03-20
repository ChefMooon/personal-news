import React, { useState } from 'react'
import { Settings2, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Switch } from '../../components/ui/switch'
import { Separator } from '../../components/ui/separator'
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

interface SavedPostsControlsProps {
  config: SavedPostsViewConfig
  availableSubreddits: string[]
  availableTags: string[]
  onConfigChange: (config: SavedPostsViewConfig) => void
}

export function SavedPostsControls({
  config,
  availableSubreddits,
  availableTags,
  onConfigChange
}: SavedPostsControlsProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const [localConfig, setLocalConfig] = useState(config)

  const handleSave = (): void => {
    onConfigChange(localConfig)
    setOpen(false)
  }

  const handleCancel = (): void => {
    setLocalConfig(config)
    setOpen(false)
  }

  const toggleSubreddit = (subreddit: string): void => {
    const current = localConfig.subreddit_filter ?? []
    const updated = current.includes(subreddit)
      ? current.filter((s) => s !== subreddit)
      : [...current, subreddit]
    setLocalConfig({
      ...localConfig,
      subreddit_filter: updated.length === 0 ? null : updated
    })
  }

  const toggleTag = (tag: string): void => {
    const current = localConfig.tag_filter ?? []
    const updated = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    setLocalConfig({
      ...localConfig,
      tag_filter: updated.length === 0 ? null : updated
    })
  }

  const toggleSource = (source: LinkSource): void => {
    const current = localConfig.source_filter ?? []
    const updated = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source]
    setLocalConfig({
      ...localConfig,
      source_filter: updated.length === 0 ? null : updated
    })
  }

  const moveSource = (source: LinkSource, direction: 'up' | 'down'): void => {
    const order = [...localConfig.sourceOrder]
    const idx = order.indexOf(source)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= order.length) return
    ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
    setLocalConfig({ ...localConfig, sourceOrder: order })
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => setOpen(true)}
        title="Configure widget"
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Saved Posts Settings</DialogTitle>
            <DialogDescription>Customize how this widget displays posts</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Source Filter */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Sources</h3>
              <div className="space-y-2">
                {ALL_SOURCES.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={
                        !localConfig.source_filter ||
                        localConfig.source_filter.includes(value)
                      }
                      onChange={() => toggleSource(value)}
                      className="rounded border-input"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Subreddit Filter */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Subreddits</h3>
              {availableSubreddits.length === 0 ? (
                <p className="text-xs text-muted-foreground">No subreddits yet</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {availableSubreddits.map((subreddit) => (
                    <label
                      key={subreddit}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={
                          !localConfig.subreddit_filter ||
                          localConfig.subreddit_filter.includes(subreddit)
                        }
                        onChange={() => toggleSubreddit(subreddit)}
                        className="rounded border-input"
                      />
                      <span>r/{subreddit}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Tag Filter */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Tags</h3>
              {availableTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tags yet</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {availableTags.map((tag) => (
                    <label
                      key={tag}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={
                          !localConfig.tag_filter || localConfig.tag_filter.includes(tag)
                        }
                        onChange={() => toggleTag(tag)}
                        className="rounded border-input"
                      />
                      <span>{tag}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Sort Options */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Sorting</h3>

              <div>
                <label className="text-sm block mb-2">Sort By</label>
                <Select value={localConfig.sort_by} onValueChange={(val) => {
                  setLocalConfig({
                    ...localConfig,
                    sort_by: val as 'saved_at' | 'score'
                  })
                }}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saved_at">Date Saved</SelectItem>
                    <SelectItem value="score">Score</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm block mb-2">Sort Direction</label>
                <Select value={localConfig.sort_dir} onValueChange={(val) => {
                  setLocalConfig({
                    ...localConfig,
                    sort_dir: val as 'asc' | 'desc'
                  })
                }}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">
                      {localConfig.sort_by === 'saved_at' ? 'Newest First' : 'Highest First'}
                    </SelectItem>
                    <SelectItem value="asc">
                      {localConfig.sort_by === 'saved_at' ? 'Oldest First' : 'Lowest First'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm block mb-2">Max Posts</label>
                <Select value={localConfig.max_posts.toString()} onValueChange={(val) => {
                  setLocalConfig({
                    ...localConfig,
                    max_posts: parseInt(val, 10)
                  })
                }}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Grouping */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Grouping</h3>

              <div>
                <label className="text-sm block mb-2">Group By</label>
                <Select value={localConfig.group_by} onValueChange={(val) => {
                  setLocalConfig({
                    ...localConfig,
                    group_by: val as 'none' | 'source'
                  })
                }}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Grouping</SelectItem>
                    <SelectItem value="source">Group by Source</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {localConfig.group_by === 'source' && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="text-sm">Show group headers</label>
                    <Switch
                      checked={localConfig.showGroupHeaders}
                      onCheckedChange={(checked) => {
                        setLocalConfig({ ...localConfig, showGroupHeaders: checked })
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-sm block mb-2">Source Order</label>
                    <div className="space-y-1">
                      {localConfig.sourceOrder.map((source, idx) => (
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
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === localConfig.sourceOrder.length - 1}
                            onClick={() => moveSource(source, 'down')}
                            className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
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

            <Separator />

            {/* Presentation */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Display</h3>

              <div className="flex items-center justify-between">
                <label className="text-sm">Show metadata</label>
                <Switch
                  checked={localConfig.showMetadata}
                  onCheckedChange={(checked) => {
                    setLocalConfig({ ...localConfig, showMetadata: checked })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm">Show source badge</label>
                <Switch
                  checked={localConfig.showSourceBadge}
                  onCheckedChange={(checked) => {
                    setLocalConfig({ ...localConfig, showSourceBadge: checked })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm">Show link URL</label>
                <Switch
                  checked={localConfig.showUrl}
                  onCheckedChange={(checked) => {
                    setLocalConfig({ ...localConfig, showUrl: checked })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm">Show body preview</label>
                <Switch
                  checked={localConfig.showBodyPreview}
                  onCheckedChange={(checked) => {
                    setLocalConfig({ ...localConfig, showBodyPreview: checked })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm">Compact view</label>
                <Switch
                  checked={localConfig.cardDensity === 'compact'}
                  onCheckedChange={(checked) => {
                    setLocalConfig({
                      ...localConfig,
                      cardDensity: checked ? 'compact' : 'detailed'
                    })
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm">Show "View All" link</label>
                <Switch
                  checked={localConfig.showViewAllLink}
                  onCheckedChange={(checked) => {
                    setLocalConfig({ ...localConfig, showViewAllLink: checked })
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
