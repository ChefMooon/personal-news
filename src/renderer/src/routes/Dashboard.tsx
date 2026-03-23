import React, { useState } from 'react'
import { toast } from 'sonner'
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
import { Settings2, Check, Plus } from 'lucide-react'
import { WidgetInstanceContext } from '../contexts/WidgetInstanceContext'
import { AddWidgetModal, type AddWidgetConfig } from '../components/AddWidgetModal'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'

// Import modules to trigger registration
import '../modules/youtube/YouTubeWidget'
import '../modules/reddit/RedditDigestWidget'
import '../modules/saved-posts/SavedPostsWidget'

export default function Dashboard(): React.ReactElement {
  const { layout, setLayout, loading } = useWidgetLayout()
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  const [editMode, setEditMode] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

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

  function handleToggleVisibility(instanceId: string): void {
    setLayout({
      ...layout,
      widget_visibility: {
        ...layout.widget_visibility,
        [instanceId]: !layout.widget_visibility[instanceId]
      }
    })
  }

  function handleRename(instanceId: string, newLabel: string | null): void {
    setLayout({
      ...layout,
      widget_instances: {
        ...layout.widget_instances,
        [instanceId]: { ...layout.widget_instances[instanceId], label: newLabel }
      }
    })
  }

  function handleRemove(instanceId: string): void {
    const { [instanceId]: _inst, ...remainingInstances } = layout.widget_instances
    const { [instanceId]: _vis, ...remainingVisibility } = layout.widget_visibility
    setLayout({
      ...layout,
      widget_order: layout.widget_order.filter((id) => id !== instanceId),
      widget_visibility: remainingVisibility,
      widget_instances: remainingInstances
    })
  }

  function handleMoveUp(instanceId: string): void {
    const index = layout.widget_order.indexOf(instanceId)
    if (index <= 0) return
    setLayout({ ...layout, widget_order: arrayMove(layout.widget_order, index, index - 1) })
  }

  function handleMoveDown(instanceId: string): void {
    const index = layout.widget_order.indexOf(instanceId)
    if (index < 0 || index >= layout.widget_order.length - 1) return
    setLayout({ ...layout, widget_order: arrayMove(layout.widget_order, index, index + 1) })
  }

  function handleAddFromModal(config: AddWidgetConfig): void {
    const instanceId = `${config.moduleId}_${Date.now()}`

    // Build new widget_order based on requested position
    let newOrder: string[]
    if (config.position === 'top') {
      newOrder = [instanceId, ...layout.widget_order]
    } else if (config.position === 'bottom') {
      newOrder = [...layout.widget_order, instanceId]
    } else {
      const afterIndex = layout.widget_order.indexOf(config.position.afterId)
      if (afterIndex === -1) {
        newOrder = [...layout.widget_order, instanceId]
      } else {
        newOrder = [
          ...layout.widget_order.slice(0, afterIndex + 1),
          instanceId,
          ...layout.widget_order.slice(afterIndex + 1)
        ]
      }
    }

    setLayout({
      ...layout,
      widget_order: newOrder,
      widget_visibility: { ...layout.widget_visibility, [instanceId]: true },
      widget_instances: {
        ...layout.widget_instances,
        [instanceId]: { instanceId, moduleId: config.moduleId, label: config.label }
      }
    })

    // Persist initial Reddit Digest subreddit filter if one was set
    if (config.moduleId === 'reddit_digest' && config.subredditFilter !== null) {
      const storageKey = `reddit_digest_view_config:${instanceId}`
      const initialConfig = {
        sort_by: 'score',
        sort_dir: 'desc',
        group_by: 'subreddit',
        layout_mode: 'columns',
        subreddit_mode: 'selected',
        selected_subreddits: config.subredditFilter,
        subreddit_order: [],
        pinned_subreddits: []
      }
      window.api
        .invoke('settings:set', storageKey, JSON.stringify(initialConfig))
        .catch((err) => {
          toast.error(err instanceof Error ? err.message : 'Failed to persist initial Reddit Digest widget settings.')
        })
    }

    setShowAddModal(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Dashboard header */}
      <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {editMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              title="Add widget"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Widget
            </Button>
          )}
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
      </div>

      {/* Widgets */}
      <div className="flex-1 p-6 space-y-6 w-full">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={layout.widget_order}
            strategy={verticalListSortingStrategy}
          >
            {layout.widget_order.map((instanceId) => {
              const instance = layout.widget_instances[instanceId]
              if (!instance) return null
              if (instance.moduleId === 'reddit_digest' && !redditDigestEnabled) return null
                if (instance.moduleId === 'saved_posts' && !savedPostsEnabled) return null
              const mod = getModule(instance.moduleId)
              if (!mod) return null
              const WidgetComponent = mod.widget
              const widgetIndex = layout.widget_order.indexOf(instanceId)
              return (
                <WidgetInstanceContext.Provider key={instanceId} value={instance}>
                  <WidgetWrapper
                    id={instanceId}
                    label={instance.label}
                    defaultLabel={mod.displayName}
                    editMode={editMode}
                    visible={layout.widget_visibility[instanceId] !== false}
                    isFirst={widgetIndex === 0}
                    isLast={widgetIndex === layout.widget_order.length - 1}
                    onToggleVisibility={handleToggleVisibility}
                    onRename={handleRename}
                    onRemove={handleRemove}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                  >
                    <WidgetComponent />
                  </WidgetWrapper>
                </WidgetInstanceContext.Provider>
              )
            })}
          </SortableContext>
        </DndContext>

      </div>

      {/* Add Widget modal */}
      {showAddModal && (
        <AddWidgetModal
          layout={layout}
          onAdd={handleAddFromModal}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
