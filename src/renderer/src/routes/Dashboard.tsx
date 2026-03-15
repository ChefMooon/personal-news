import React, { useState } from 'react'
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { useWidgetLayout } from '../hooks/useWidgetLayout'
import { WidgetWrapper } from '../components/WidgetWrapper'
import { getModule } from '../modules/registry'
import { Button } from '../components/ui/button'
import { Settings2, Check } from 'lucide-react'

// Import modules to trigger registration
import '../modules/youtube/YouTubeWidget'
import '../modules/reddit/RedditDigestWidget'
import '../modules/saved-posts/SavedPostsWidget'

export default function Dashboard(): React.ReactElement {
  const { layout, setLayout, loading } = useWidgetLayout()
  const [editMode, setEditMode] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = layout.widget_order.indexOf(active.id as string)
    const newIndex = layout.widget_order.indexOf(over.id as string)
    const newOrder = arrayMove(layout.widget_order, oldIndex, newIndex)

    setLayout({ ...layout, widget_order: newOrder })
  }

  function handleToggleVisibility(id: string): void {
    const newVisibility = {
      ...layout.widget_visibility,
      [id]: !layout.widget_visibility[id]
    }
    setLayout({ ...layout, widget_visibility: newVisibility })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Dashboard header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Button
          variant={editMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setEditMode((e) => !e)}
        >
          {editMode ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              Done
            </>
          ) : (
            <>
              <Settings2 className="h-4 w-4 mr-1" />
              Edit Layout
            </>
          )}
        </Button>
      </div>

      {/* Widgets */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.widget_order}
            strategy={verticalListSortingStrategy}
          >
            {layout.widget_order.map((moduleId) => {
              const mod = getModule(moduleId)
              if (!mod) return null
              const WidgetComponent = mod.widget
              return (
                <WidgetWrapper
                  key={moduleId}
                  id={moduleId}
                  editMode={editMode}
                  visible={layout.widget_visibility[moduleId] !== false}
                  onToggleVisibility={handleToggleVisibility}
                >
                  <WidgetComponent />
                </WidgetWrapper>
              )
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
