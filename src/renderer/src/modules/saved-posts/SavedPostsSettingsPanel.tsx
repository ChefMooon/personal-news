import React from 'react'
import { GripVertical, ArrowUp, ArrowDown } from 'lucide-react'
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
  const toggleSubreddit = (subreddit: string): void => {
    const current = config.subreddit_filter ?? []
    const updated = current.includes(subreddit)
      ? current.filter((s) => s !== subreddit)
      : [...current, subreddit]
    onChange({
      ...config,
      subreddit_filter: updated.length === 0 ? null : updated
    })
  }

  const toggleTag = (tag: string): void => {
    const current = config.tag_filter ?? []
    const updated = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    onChange({
      ...config,
      tag_filter: updated.length === 0 ? null : updated
    })
  }

  const toggleSource = (source: LinkSource): void => {
    const current = config.source_filter ?? []
    const updated = current.includes(source)
      ? current.filter((s) => s !== source)
      : [...current, source]
    onChange({
      ...config,
      source_filter: updated.length === 0 ? null : updated
    })
  }

  const moveSource = (source: LinkSource, direction: 'up' | 'down'): void => {
    const order = [...config.sourceOrder]
    const idx = order.indexOf(source)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= order.length) return
    ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
    onChange({ ...config, sourceOrder: order })
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 flex-1">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pl-2 pr-4">
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
                    checked={!config.source_filter || config.source_filter.includes(value)}
                    onChange={() => toggleSource(value)}
                    className="rounded border-input"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

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
                      checked={!config.subreddit_filter || config.subreddit_filter.includes(subreddit)}
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
                      checked={!config.tag_filter || config.tag_filter.includes(tag)}
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

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Sorting</h3>

            <div>
              <label className="text-sm block mb-2">Sort By</label>
              <Select
                value={config.sort_by}
                onValueChange={(val) => {
                  onChange({
                    ...config,
                    sort_by: val as 'saved_at' | 'score'
                  })
                }}
              >
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
              <Select
                value={config.sort_dir}
                onValueChange={(val) => {
                  onChange({
                    ...config,
                    sort_dir: val as 'asc' | 'desc'
                  })
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">
                    {config.sort_by === 'saved_at' ? 'Newest First' : 'Highest First'}
                  </SelectItem>
                  <SelectItem value="asc">
                    {config.sort_by === 'saved_at' ? 'Oldest First' : 'Lowest First'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm block mb-2">Max Posts</label>
              <Select
                value={config.max_posts.toString()}
                onValueChange={(val) => {
                  onChange({
                    ...config,
                    max_posts: parseInt(val, 10)
                  })
                }}
              >
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

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Grouping</h3>

            <div>
              <label className="text-sm block mb-2">Group By</label>
              <Select
                value={config.group_by}
                onValueChange={(val) => {
                  onChange({
                    ...config,
                    group_by: val as 'none' | 'source'
                  })
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Grouping</SelectItem>
                  <SelectItem value="source">Group by Source</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {config.group_by === 'source' && (
              <>
                <div className="flex items-center justify-between">
                  <label className="text-sm">Show group headers</label>
                  <Switch
                    checked={config.showGroupHeaders}
                    onCheckedChange={(checked) => {
                      onChange({ ...config, showGroupHeaders: checked })
                    }}
                  />
                </div>

                <div>
                  <label className="text-sm block mb-2">Source Order</label>
                  <div className="space-y-1">
                    {config.sourceOrder.map((source, idx) => (
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
                          disabled={idx === config.sourceOrder.length - 1}
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

          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Display</h3>

            <div className="flex items-center justify-between">
              <label className="text-sm">Show metadata</label>
              <Switch
                checked={config.showMetadata}
                onCheckedChange={(checked) => {
                  onChange({ ...config, showMetadata: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">Show source badge</label>
              <Switch
                checked={config.showSourceBadge}
                onCheckedChange={(checked) => {
                  onChange({ ...config, showSourceBadge: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">Show link URL</label>
              <Switch
                checked={config.showUrl}
                onCheckedChange={(checked) => {
                  onChange({ ...config, showUrl: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">Show body preview</label>
              <Switch
                checked={config.showBodyPreview}
                onCheckedChange={(checked) => {
                  onChange({ ...config, showBodyPreview: checked })
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">Compact view</label>
              <Switch
                checked={config.cardDensity === 'compact'}
                onCheckedChange={(checked) => {
                  onChange({
                    ...config,
                    cardDensity: checked ? 'compact' : 'detailed'
                  })
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm">Show "View All" link</label>
              <Switch
                checked={config.showViewAllLink}
                onCheckedChange={(checked) => {
                  onChange({ ...config, showViewAllLink: checked })
                }}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
