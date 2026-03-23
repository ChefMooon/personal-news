import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { WidgetLayout, WidgetInstance } from '../../../shared/ipc-types'
import { getModule } from '../modules/registry'

const DEFAULT_LAYOUT: WidgetLayout = {
  widget_order: ['youtube_1', 'reddit_digest_1', 'saved_posts_1'],
  widget_visibility: {
    youtube_1: true,
    reddit_digest_1: true,
    saved_posts_1: true
  },
  widget_instances: {
    youtube_1: { instanceId: 'youtube_1', moduleId: 'youtube', label: null },
    reddit_digest_1: { instanceId: 'reddit_digest_1', moduleId: 'reddit_digest', label: null },
    saved_posts_1: { instanceId: 'saved_posts_1', moduleId: 'saved_posts', label: null }
  }
}

/**
 * Migrate a layout to the current instance-based format. Handles three cases:
 *
 *  1. Fully migrated  — widget_instances is present and non-empty → return as-is.
 *  2. Partially migrated — widget_instances is empty/missing but widget_order already
 *     contains instance IDs (e.g. "youtube_1", "reddit_digest_1704892344567"). This
 *     happens when widget_instances was never persisted by the old IPC handler. The
 *     instance IDs are reconstructed by stripping the trailing "_<digits>" suffix to
 *     recover the moduleId, and stored visibility is preserved by key.
 *  3. Old format — widget_order contains raw moduleIds ("youtube", "reddit_digest").
 *     Creates canonical "_1" instance IDs and maps old visibility keys.
 */
function migrateLayout(raw: unknown): WidgetLayout {
  const data = raw as Partial<WidgetLayout> & { widget_order?: string[] }

  // Case 1: fully migrated
  if (data.widget_instances && Object.keys(data.widget_instances).length > 0) {
    return {
      widget_order: data.widget_order ?? [],
      widget_visibility: data.widget_visibility ?? {},
      widget_instances: data.widget_instances
    }
  }

  // Cases 2 & 3: reconstruct widget_instances from widget_order.
  // An already-generated instance ID always ends with _<digits>
  // (e.g. "youtube_1", "reddit_digest_1704892344567").
  const INSTANCE_ID_RE = /^(.+)_\d+$/
  const storedOrder: string[] = data.widget_order ?? ['youtube', 'reddit_digest', 'saved_posts']
  const storedVisibility = (data.widget_visibility ?? {}) as Record<string, boolean>

  const instances: Record<string, WidgetInstance> = {}
  const newOrder: string[] = []
  const newVisibility: Record<string, boolean> = {}

  for (const item of storedOrder) {
    const match = INSTANCE_ID_RE.exec(item)
    if (match) {
      // Case 2: item is already an instance ID — reconstruct the entry
      const instanceId = item
      const moduleId = match[1]
      instances[instanceId] = { instanceId, moduleId, label: null }
      newOrder.push(instanceId)
      // Visibility was stored under the instance ID key
      newVisibility[instanceId] = storedVisibility[instanceId] !== false
    } else {
      // Case 3: item is a raw module ID — generate a canonical instance ID
      const moduleId = item
      const instanceId = `${moduleId}_1`
      instances[instanceId] = { instanceId, moduleId, label: null }
      newOrder.push(instanceId)
      // Visibility was stored under the module ID key in the old format
      newVisibility[instanceId] = storedVisibility[moduleId] !== false
    }
  }

  return {
    widget_order: newOrder,
    widget_visibility: newVisibility,
    widget_instances: instances
  }
}

/**
 * Remove any widget instances whose moduleId is not a registered module.
 * This cleans up ghost entries left by previous bad migration passes
 * (e.g. "youtube_1_1_1" with moduleId "youtube_1_1" — not a real module).
 * Returns the pruned layout and a flag indicating whether anything was removed.
 */
function pruneLayout(layout: WidgetLayout): { layout: WidgetLayout; changed: boolean } {
  const validIds = layout.widget_order.filter((instanceId) => {
    const instance = layout.widget_instances[instanceId]
    return instance != null && getModule(instance.moduleId) != null
  })

  if (validIds.length === layout.widget_order.length) {
    return { layout, changed: false }
  }

  const cleanInstances: Record<string, WidgetInstance> = {}
  const cleanVisibility: Record<string, boolean> = {}
  for (const id of validIds) {
    cleanInstances[id] = layout.widget_instances[id]
    cleanVisibility[id] = layout.widget_visibility[id] ?? true
  }

  return {
    layout: {
      widget_order: validIds,
      widget_visibility: cleanVisibility,
      widget_instances: cleanInstances
    },
    changed: true
  }
}

export function useWidgetLayout(): {
  layout: WidgetLayout
  setLayout: (layout: WidgetLayout) => void
  loading: boolean
} {
  const [layout, setLayoutState] = useState<WidgetLayout>(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api
      .invoke('settings:getWidgetLayout')
      .then((data) => {
        const migrated = migrateLayout(data)
        const { layout: pruned, changed } = pruneLayout(migrated)
        setLayoutState(pruned)
        // Persist the clean layout so ghost entries don't re-appear
        if (changed) {
          window.api.invoke('settings:setWidgetLayout', pruned).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Failed to persist cleaned widget layout.')
          })
        }
        setLoading(false)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load widget layout.')
        setLoading(false)
      })
  }, [])

  const setLayout = (newLayout: WidgetLayout): void => {
    setLayoutState(newLayout)
    window.api.invoke('settings:setWidgetLayout', newLayout).catch((err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save widget layout.')
    })
  }

  return { layout, setLayout, loading }
}
