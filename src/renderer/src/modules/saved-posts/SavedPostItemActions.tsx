import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { MoreHorizontal, ExternalLink, Circle, CircleCheck, PencilLine, Trash2, Plus, X } from 'lucide-react'
import { IPC, type DeleteSavedPostsResult, type IpcMutationResult, type SavedPost } from '../../../../shared/ipc-types'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../../components/ui/alert-dialog'
import { cn } from '../../lib/utils'

interface SavedPostItemActionsProps {
  post: SavedPost
  allTags: string[]
  onOpenPost: (post: SavedPost) => void
  onSetViewed: (post: SavedPost, viewed: boolean) => void
  onAfterMutation: () => Promise<void> | void
  children: (controls: {
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => void
    trigger: React.ReactElement
    viewedToggle: React.ReactElement
  }) => React.ReactNode
}

interface MenuPosition {
  x: number
  y: number
}

const MENU_WIDTH = 208
const MENU_HEIGHT = 176
const VIEWPORT_PADDING = 12

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const tag of tags) {
    const trimmed = tag.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

function clampMenuPosition(x: number, y: number): MenuPosition {
  const maxX = Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING)
  const maxY = Math.max(VIEWPORT_PADDING, window.innerHeight - MENU_HEIGHT - VIEWPORT_PADDING)

  return {
    x: Math.min(Math.max(x, VIEWPORT_PADDING), maxX),
    y: Math.min(Math.max(y, VIEWPORT_PADDING), maxY)
  }
}

export function SavedPostItemActions({
  post,
  allTags,
  onOpenPost,
  onSetViewed,
  onAfterMutation,
  children
}: SavedPostItemActionsProps): React.ReactElement {
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draftNote, setDraftNote] = useState(post.note ?? '')
  const [draftTags, setDraftTags] = useState<string[]>(post.tags)
  const [newTag, setNewTag] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const suggestionsId = useId()
  const isViewed = post.viewed_at !== null

  useEffect(() => {
    setDraftNote(post.note ?? '')
    setDraftTags(post.tags)
    setNewTag('')
  }, [post.note, post.post_id, post.tags])

  const openMenuAt = useCallback((x: number, y: number): void => {
    setMenuPosition(clampMenuPosition(x, y))
  }, [])

  const closeMenu = useCallback((): void => {
    setMenuPosition(null)
  }, [])

  useEffect(() => {
    if (!menuPosition) return

    const handlePointerDown = (event: MouseEvent | TouchEvent): void => {
      const target = event.target as Node | null
      if (
        target &&
        (menuRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return
      }
      closeMenu()
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    const handleViewportChange = (): void => {
      closeMenu()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('touchstart', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('touchstart', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeMenu, menuPosition])

  const openFromTrigger = useCallback((): void => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      openMenuAt(VIEWPORT_PADDING, VIEWPORT_PADDING)
      return
    }

    openMenuAt(rect.right - MENU_WIDTH, rect.bottom + 8)
  }, [openMenuAt])

  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>): void => {
      event.preventDefault()
      openMenuAt(event.clientX, event.clientY)
    },
    [openMenuAt]
  )

  const addTag = useCallback((): void => {
    const candidate = newTag.trim()
    if (!candidate) return

    setDraftTags((current) => normalizeTags([...current, candidate]))
    setNewTag('')
  }, [newTag])

  const removeTag = useCallback((tag: string): void => {
    setDraftTags((current) => current.filter((value) => value !== tag))
  }, [])

  const saveEdits = useCallback(async (): Promise<void> => {
    const normalizedTags = normalizeTags(draftTags)
    const normalizedNote = draftNote.trim()
    const nextNote = normalizedNote.length > 0 ? normalizedNote : null
    const previousNote = post.note ?? null
    const previousTags = normalizeTags(post.tags)
    const tagsChanged =
      normalizedTags.length !== previousTags.length ||
      normalizedTags.some((tag, index) => tag !== previousTags[index])

    if (!tagsChanged && nextNote === previousNote) {
      setEditorOpen(false)
      return
    }

    setSaving(true)
    try {
      if (nextNote !== previousNote) {
        const result = (await window.api.invoke(
          IPC.REDDIT_UPDATE_SAVED_POST_NOTE,
          post.post_id,
          nextNote
        )) as IpcMutationResult
        if (!result.ok) {
          toast.error(result.error ?? 'Failed to update note.')
          return
        }
      }

      if (tagsChanged) {
        await window.api.invoke(IPC.REDDIT_UPDATE_POST_TAGS, post.post_id, normalizedTags)
      }

      await onAfterMutation()
      toast.success('Saved post updated.')
      setEditorOpen(false)
      closeMenu()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update saved post.')
    } finally {
      setSaving(false)
    }
  }, [closeMenu, draftNote, draftTags, onAfterMutation, post.note, post.post_id, post.tags])

  const handleDelete = useCallback(async (): Promise<void> => {
    setDeleting(true)
    try {
      const result = (await window.api.invoke(IPC.REDDIT_DELETE_SAVED_POSTS, {
        post_ids: [post.post_id]
      })) as DeleteSavedPostsResult
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to delete saved post.')
        return
      }

      await onAfterMutation()
      toast.success('Saved post deleted.')
      setDeleteOpen(false)
      closeMenu()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete saved post.')
    } finally {
      setDeleting(false)
    }
  }, [closeMenu, onAfterMutation, post.post_id])

  const availableTagSuggestions = useMemo(
    () => allTags.filter((tag) => !draftTags.includes(tag)),
    [allTags, draftTags]
  )

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        if (menuPosition) {
          closeMenu()
        } else {
          openFromTrigger()
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        openMenuAt(event.clientX, event.clientY)
      }}
      className="mt-0.5 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Saved post actions"
      aria-haspopup="menu"
      aria-expanded={menuPosition !== null}
      title="Saved post actions"
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  )

  const viewedToggle = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onSetViewed(post, !isViewed)
      }}
      className="mt-0.5 inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      aria-label={isViewed ? 'Mark post as unviewed' : 'Mark post as viewed'}
      aria-pressed={isViewed}
      title={isViewed ? 'Viewed - click to mark unviewed' : 'Unviewed - click to mark viewed'}
    >
      {isViewed ? <CircleCheck className="h-4 w-4 text-emerald-400" /> : <Circle className="h-4 w-4" />}
    </button>
  )

  return (
    <>
      {children({ onContextMenu: handleContextMenu, trigger, viewedToggle })}
      {menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${post.title}`}
              className="fixed z-[60] min-w-52 rounded-md border bg-popover text-popover-foreground shadow-lg"
              style={{ left: menuPosition.x, top: menuPosition.y }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onOpenPost(post)
                  closeMenu()
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Open link
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onSetViewed(post, !isViewed)
                  closeMenu()
                }}
              >
                {isViewed ? <Circle className="h-4 w-4" /> : <CircleCheck className="h-4 w-4 text-emerald-500" />}
                {isViewed ? 'Mark unviewed' : 'Mark viewed'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setEditorOpen(true)
                  closeMenu()
                }}
              >
                <PencilLine className="h-4 w-4" />
                Edit note and tags
              </button>
              <div className="my-1 border-t" />
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setDeleteOpen(true)
                  closeMenu()
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            </div>,
            document.body
          )
        : null}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Saved Post</DialogTitle>
            <DialogDescription>
              Update the note and tags for this saved post.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium line-clamp-2">{post.title}</p>
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                rows={5}
                placeholder="Add a note for this saved post"
                className={cn(
                  'flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
                  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Tags</p>
                <p className="text-xs text-muted-foreground">{draftTags.length} selected</p>
              </div>
              <div className="flex min-h-10 flex-wrap gap-1 rounded-md border border-dashed px-3 py-2">
                {draftTags.length > 0 ? (
                  draftTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-destructive"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No tags yet.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  placeholder="Add a tag"
                  list={suggestionsId}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addTag()
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="h-4 w-4" />
                  Add tag
                </Button>
              </div>
              <datalist id={suggestionsId}>
                {availableTagSuggestions.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveEdits()} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete saved post?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{post.title}” from Saved Posts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}