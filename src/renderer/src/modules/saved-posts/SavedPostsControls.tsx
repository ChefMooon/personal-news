import React, { useState } from 'react'
import { Settings2, ChevronDown } from 'lucide-react'
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
import type { SavedPostsViewConfig } from '../../../shared/ipc-types'

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
                          localConfig.tag_filter && localConfig.tag_filter.includes(tag)
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
              <div>
                <label className="text-sm font-semibold block mb-2">Sort By</label>
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
                <label className="text-sm font-semibold block mb-2">Sort Direction</label>
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
                <label className="text-sm font-semibold block mb-2">Max Posts</label>
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
