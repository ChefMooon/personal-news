import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC } from '../../../../shared/ipc-types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Button } from '../../components/ui/button'
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

interface TagManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onTagUpdated: () => void
}

export function TagManagementModal({
  isOpen,
  onClose,
  onTagUpdated
}: TagManagementModalProps): React.ReactElement {
  const [tags, setTags] = useState<string[]>([])
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingTag, setDeletingTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchTags = (): void => {
    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setTags(result as string[]))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load tags.')
      })
  }

  useEffect(() => {
    if (isOpen) fetchTags()
  }, [isOpen])

  const handleRename = async (): Promise<void> => {
    if (!editingTag || !editValue.trim()) return
    setLoading(true)
    try {
      await window.api.invoke(IPC.REDDIT_RENAME_TAG, editingTag, editValue.trim())
      setEditingTag(null)
      setEditValue('')
      fetchTags()
      onTagUpdated()
      toast.success('Tag renamed.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename tag.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (tag: string): Promise<void> => {
    setLoading(true)
    try {
      await window.api.invoke(IPC.REDDIT_DELETE_TAG, tag)
      setDeletingTag(null)
      fetchTags()
      onTagUpdated()
      toast.success('Tag deleted.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete tag.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Tags</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {tags.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No tags yet.</p>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/50"
                >
                  {editingTag === tag ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-sm"
                        aria-label={`Rename tag ${tag}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleRename()
                          if (e.key === 'Escape') setEditingTag(null)
                        }}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRename()}
                        disabled={loading}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTag(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{tag}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingTag(tag)
                            setEditValue(tag)
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => setDeletingTag(tag)}
                        >
                          Delete
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingTag !== null}
        onOpenChange={(open) => !open && setDeletingTag(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag &quot;{deletingTag}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the tag from all posts. The posts themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTag && void handleDelete(deletingTag)}
              disabled={loading}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
