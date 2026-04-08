import React from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { getSportLabel } from '../../../../shared/sports'
import { cn } from '../../lib/utils'

function SortableSportPill({ sport }: { sport: string }): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sport })

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm',
        isDragging && 'cursor-grabbing'
      )}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${getSportLabel(sport)}`}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      {getSportLabel(sport)}
    </button>
  )
}

export function SportOrderControl({
  orderedSports,
  onChange
}: {
  orderedSports: string[]
  onChange: (sports: string[]) => void
}): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = orderedSports.indexOf(String(active.id))
    const newIndex = orderedSports.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    onChange(arrayMove(orderedSports, oldIndex, newIndex))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Sport order</p>
        <p className="text-xs text-muted-foreground">Drag to reorder page sections</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedSports} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-2">
            {orderedSports.map((sport) => (
              <SortableSportPill key={sport} sport={sport} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default SportOrderControl