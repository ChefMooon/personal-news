import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye, EyeOff } from 'lucide-react'
import { cn } from '../lib/utils'

interface WidgetWrapperProps {
  id: string
  editMode: boolean
  visible: boolean
  onToggleVisibility: (id: string) => void
  children: React.ReactNode
}

export function WidgetWrapper({
  id,
  editMode,
  visible,
  onToggleVisibility,
  children
}: WidgetWrapperProps): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('relative', !visible && editMode && 'opacity-50')}
    >
      {editMode && (
        <div className="flex items-center gap-2 mb-1 px-1">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {/* Visibility toggle */}
          <button
            onClick={() => onToggleVisibility(id)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            aria-label={visible ? 'Hide widget' : 'Show widget'}
          >
            {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <span className="text-xs text-muted-foreground">{id}</span>
        </div>
      )}
      {(visible || editMode) && children}
    </div>
  )
}
