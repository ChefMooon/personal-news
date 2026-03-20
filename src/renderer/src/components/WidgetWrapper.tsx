import React, { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff, Trash2, Pencil, ChevronUp, ChevronDown } from 'lucide-react'

interface WidgetWrapperProps {
  id: string
  label: string | null
  defaultLabel: string
  editMode: boolean
  visible: boolean
  isFirst: boolean
  isLast: boolean
  onToggleVisibility: (id: string) => void
  onRename: (id: string, newLabel: string | null) => void
  onRemove: (id: string) => void
  onMoveUp: (id: string) => void
  onMoveDown: (id: string) => void
  children: React.ReactNode
}

export function WidgetWrapper({
  id,
  label,
  defaultLabel,
  editMode,
  visible,
  isFirst,
  isLast,
  onToggleVisibility,
  onRename,
  onRemove,
  onMoveUp,
  onMoveDown,
  children
}: WidgetWrapperProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [renaming, setRenaming] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [renaming])

  function startRename(): void {
    setDraftLabel(label ?? defaultLabel)
    setRenaming(true)
  }

  function commitRename(): void {
    const trimmed = draftLabel.trim()
    // Treat empty or unchanged-from-default as "no custom label"
    onRename(id, trimmed === '' || trimmed === defaultLabel ? null : trimmed)
    setRenaming(false)
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative"
    >
      {editMode && (
        <div className="flex items-center gap-1 mb-1 px-1">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Move up */}
          <button
            onClick={() => onMoveUp(id)}
            disabled={isFirst}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move widget up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Move down */}
          <button
            onClick={() => onMoveDown(id)}
            disabled={isLast}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move widget down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          {/* Visibility toggle */}
          <button
            onClick={() => onToggleVisibility(id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label={visible ? 'Hide widget' : 'Show widget'}
          >
            {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>

          {/* Inline rename */}
          {renaming ? (
            <input
              ref={inputRef}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              className="flex-1 text-xs bg-background border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              onClick={startRename}
              className="flex-1 text-left flex items-center gap-1.5 px-1 py-0.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-accent group"
              title="Click to rename"
            >
              <span className="truncate">{label ?? defaultLabel}</span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
            </button>
          )}

          {/* Remove */}
          <button
            onClick={() => onRemove(id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent"
            aria-label="Remove widget"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* When hidden in edit mode, show a compact placeholder instead of the full widget */}
      {editMode && !visible ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 flex items-center gap-3 text-muted-foreground select-none">
          <EyeOff className="h-4 w-4 shrink-0" />
          <span className="text-sm">Widget hidden — click the eye icon above to show it again.</span>
        </div>
      ) : (
        visible && children
      )}
    </div>
  )
}
