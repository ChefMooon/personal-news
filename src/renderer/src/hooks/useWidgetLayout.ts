import { useEffect, useMemo, useRef, useState } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import { toast } from 'sonner'
import { IPC } from '../../../shared/ipc-types'
import type {
  DashboardConfigCloneOperation,
  DashboardIcon,
  DashboardView,
  DashboardViewsMutation,
  DashboardViewsState,
  WidgetLayout,
  WidgetInstance
} from '../../../shared/ipc-types'
import { getModule } from '../modules/registry'

type WidgetTransferPosition = 'top' | 'bottom' | { afterId: string }

interface CrossViewWidgetTransferInput {
  sourceViewId: string
  targetViewId: string
  instanceId: string
  position?: WidgetTransferPosition
  switchToTarget?: boolean
}

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

const DEFAULT_DASHBOARD_VIEW_ID = 'dashboard_home'

const DEFAULT_DASHBOARD_VIEWS_STATE: DashboardViewsState = {
  view_order: [DEFAULT_DASHBOARD_VIEW_ID],
  views: {
    [DEFAULT_DASHBOARD_VIEW_ID]: {
      id: DEFAULT_DASHBOARD_VIEW_ID,
      name: 'Home',
      icon: null,
      layout: DEFAULT_LAYOUT
    }
  }
}

const DASHBOARD_ICON_VALUES: DashboardIcon[] = [
  'layout',
  'youtube',
  'newspaper',
  'bookmark',
  'trophy',
  'cloud',
  'terminal',
  'bell',
  'star',
  'flame'
]

function isDashboardIcon(value: unknown): value is DashboardIcon {
  return typeof value === 'string' && DASHBOARD_ICON_VALUES.includes(value as DashboardIcon)
}

function createEmptyLayout(): WidgetLayout {
  return {
    widget_order: [],
    widget_visibility: {},
    widget_instances: {}
  }
}

function createDashboardViewId(seed = Date.now()): string {
  return `dashboard_${seed}`
}

function createWidgetInstanceId(moduleId: string, seed: number): string {
  return `${moduleId}_${seed}`
}

function insertWidgetInstance(
  widgetOrder: string[],
  instanceId: string,
  position: WidgetTransferPosition = 'bottom'
): string[] {
  if (position === 'top') {
    return [instanceId, ...widgetOrder]
  }

  if (position === 'bottom') {
    return [...widgetOrder, instanceId]
  }

  const afterIndex = widgetOrder.indexOf(position.afterId)
  if (afterIndex === -1) {
    return [...widgetOrder, instanceId]
  }

  return [
    ...widgetOrder.slice(0, afterIndex + 1),
    instanceId,
    ...widgetOrder.slice(afterIndex + 1)
  ]
}

function resolveActiveViewId(state: DashboardViewsState, candidate?: string | null): string {
  if (candidate && state.view_order.includes(candidate) && state.views[candidate]) {
    return candidate
  }

  const first = state.view_order.find((viewId) => state.views[viewId])
  if (first) {
    return first
  }

  return DEFAULT_DASHBOARD_VIEW_ID
}

function normalizeDashboardViewName(name: unknown, index: number): string {
  if (typeof name === 'string' && name.trim().length > 0) {
    return name.trim()
  }

  return index === 0 ? 'Home' : `Dashboard ${index + 1}`
}

function normalizeDashboardView(raw: unknown, id: string, index: number): DashboardView {
  const candidate = raw as Partial<DashboardView> & { layout?: unknown }

  return {
    id,
    name: normalizeDashboardViewName(candidate.name, index),
    icon: isDashboardIcon(candidate.icon) ? candidate.icon : null,
    layout: candidate.layout ? migrateLayout(candidate.layout) : createEmptyLayout()
  }
}

function migrateDashboardViewsState(raw: unknown): DashboardViewsState {
  const candidate = raw as Partial<DashboardViewsState>
  const rawViews = candidate.views
  const rawOrder = Array.isArray(candidate.view_order) ? candidate.view_order : []

  if (!rawViews || typeof rawViews !== 'object') {
    return DEFAULT_DASHBOARD_VIEWS_STATE
  }

  const viewsRecord = rawViews as Record<string, unknown>
  const orderedIds = rawOrder
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .filter((value, index, values) => values.indexOf(value) === index)
    .filter((value) => value in viewsRecord)

  const discoveredIds = Object.keys(viewsRecord).filter((value) => !orderedIds.includes(value))
  const finalOrder = [...orderedIds, ...discoveredIds]

  if (finalOrder.length === 0) {
    return DEFAULT_DASHBOARD_VIEWS_STATE
  }

  const views = Object.fromEntries(
    finalOrder.map((viewId, index) => [viewId, normalizeDashboardView(viewsRecord[viewId], viewId, index)])
  )

  return {
    view_order: finalOrder,
    views
  }
}

function pruneDashboardViewsState(
  state: DashboardViewsState
): { state: DashboardViewsState; changed: boolean; removedInstanceIds: string[] } {
  let changed = false
  const removedInstanceIds: string[] = []
  const nextViews: Record<string, DashboardView> = {}
  const nextOrder: string[] = []

  for (const viewId of state.view_order) {
    const view = state.views[viewId]
    if (!view) {
      changed = true
      continue
    }

    const migratedLayout = migrateLayout(view.layout)
    const { layout: prunedLayout, changed: layoutChanged } = pruneLayout(migratedLayout)
    if (layoutChanged) {
      const prunedIds = Object.keys(migratedLayout.widget_instances).filter(
        (instanceId) => !(instanceId in prunedLayout.widget_instances)
      )
      removedInstanceIds.push(...prunedIds)
      changed = true
    }

    const normalizedView: DashboardView = {
      id: viewId,
      name: view.name.trim().length > 0 ? view.name.trim() : normalizeDashboardViewName('', nextOrder.length),
      icon: view.icon,
      layout: prunedLayout
    }

    nextViews[viewId] = normalizedView
    nextOrder.push(viewId)
  }

  if (nextOrder.length === 0) {
    return {
      state: DEFAULT_DASHBOARD_VIEWS_STATE,
      changed: true,
      removedInstanceIds: Array.from(new Set(removedInstanceIds))
    }
  }

  return {
    state: {
      view_order: nextOrder,
      views: nextViews
    },
    changed,
    removedInstanceIds: Array.from(new Set(removedInstanceIds))
  }
}

function cloneLayoutWithNewInstanceIds(layout: WidgetLayout): {
  layout: WidgetLayout
  cloneOperations: DashboardConfigCloneOperation[]
} {
  const timestamp = Date.now()
  const instanceIdMap = new Map<string, string>()
  const cloneOperations: DashboardConfigCloneOperation[] = []

  layout.widget_order.forEach((instanceId, index) => {
    const instance = layout.widget_instances[instanceId]
    if (!instance) {
      return
    }

    const nextInstanceId = createWidgetInstanceId(instance.moduleId, timestamp + index)
    instanceIdMap.set(instanceId, nextInstanceId)
    cloneOperations.push({
      sourceInstanceId: instanceId,
      targetInstanceId: nextInstanceId
    })
  })

  const widget_order = layout.widget_order
    .map((instanceId) => instanceIdMap.get(instanceId))
    .filter((instanceId): instanceId is string => Boolean(instanceId))

  const widget_instances = Object.fromEntries(
    widget_order.map((instanceId, index) => {
      const sourceId = layout.widget_order[index]
      const source = layout.widget_instances[sourceId]
      return [
        instanceId,
        {
          ...source,
          instanceId
        }
      ]
    })
  ) as Record<string, WidgetInstance>

  const widget_visibility = Object.fromEntries(
    widget_order.map((instanceId, index) => {
      const sourceId = layout.widget_order[index]
      return [instanceId, layout.widget_visibility[sourceId] ?? true]
    })
  ) as Record<string, boolean>

  return {
    layout: {
      widget_order,
      widget_instances,
      widget_visibility
    },
    cloneOperations
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
  dashboardViews: DashboardView[]
  activeViewId: string
  activeView: DashboardView
  setActiveViewId: (viewId: string) => void
  setActiveLayout: (layout: WidgetLayout, options?: Omit<DashboardViewsMutation, 'state'>) => void
  createDashboardView: (input: { name: string; icon: DashboardIcon | null }) => void
  updateDashboardViewMeta: (viewId: string, input: { name: string; icon: DashboardIcon | null }) => void
  duplicateDashboardView: (viewId: string) => void
  deleteDashboardView: (viewId: string) => void
  moveDashboardView: (viewId: string, direction: 'left' | 'right') => void
  moveWidgetToView: (input: CrossViewWidgetTransferInput) => boolean
  copyWidgetToView: (input: CrossViewWidgetTransferInput) => boolean
  loading: boolean
} {
  const [state, setState] = useState<DashboardViewsState>(DEFAULT_DASHBOARD_VIEWS_STATE)
  const [activeViewId, setActiveViewIdState] = useState(DEFAULT_DASHBOARD_VIEW_ID)
  const [loading, setLoading] = useState(true)
  const activeViewIdRef = useRef(DEFAULT_DASHBOARD_VIEW_ID)

  const dashboardViews = useMemo(
    () => state.view_order.map((viewId) => state.views[viewId]).filter((view): view is DashboardView => Boolean(view)),
    [state]
  )

  const activeView = useMemo(() => {
    const resolvedId = resolveActiveViewId(state, activeViewId)
    return state.views[resolvedId] ?? DEFAULT_DASHBOARD_VIEWS_STATE.views[DEFAULT_DASHBOARD_VIEW_ID]
  }, [activeViewId, state])

  const setResolvedActiveViewId = (nextState: DashboardViewsState, candidate?: string | null): void => {
    const resolvedId = resolveActiveViewId(nextState, candidate ?? activeViewIdRef.current)
    activeViewIdRef.current = resolvedId
    setActiveViewIdState(resolvedId)
  }

  const persistState = (
    nextState: DashboardViewsState,
    options?: Omit<DashboardViewsMutation, 'state'>,
    nextActiveViewId?: string | null
  ): void => {
    setState(nextState)
    setResolvedActiveViewId(nextState, nextActiveViewId)
    window.api
      .invoke(IPC.SETTINGS_SET_DASHBOARD_VIEWS, {
        state: nextState,
        deleteInstanceIds: options?.deleteInstanceIds,
        cloneInstanceConfigs: options?.cloneInstanceConfigs
      } satisfies DashboardViewsMutation)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to save dashboard views.')
      })
  }

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET_DASHBOARD_VIEWS)
      .then((data) => {
        const migrated = migrateDashboardViewsState(data)
        const { state: prunedState, changed, removedInstanceIds } = pruneDashboardViewsState(migrated)
        setState(prunedState)
        setResolvedActiveViewId(prunedState, prunedState.view_order[0] ?? null)
        if (changed) {
          window.api.invoke(IPC.SETTINGS_SET_DASHBOARD_VIEWS, {
            state: prunedState,
            deleteInstanceIds: removedInstanceIds
          } satisfies DashboardViewsMutation).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Failed to persist cleaned dashboard views.')
          })
        }
        setLoading(false)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard views.')
        setLoading(false)
      })
  }, [])

  const setActiveViewId = (viewId: string): void => {
    if (!state.views[viewId]) {
      return
    }
    activeViewIdRef.current = viewId
    setActiveViewIdState(viewId)
  }

  const setActiveLayout = (
    newLayout: WidgetLayout,
    options?: Omit<DashboardViewsMutation, 'state'>
  ): void => {
    const resolvedId = resolveActiveViewId(state, activeViewIdRef.current)
    const currentView = state.views[resolvedId]
    if (!currentView) {
      return
    }

    const nextState: DashboardViewsState = {
      ...state,
      views: {
        ...state.views,
        [resolvedId]: {
          ...currentView,
          layout: newLayout
        }
      }
    }

    persistState(nextState, options)
  }

  const createDashboardView = (input: { name: string; icon: DashboardIcon | null }): void => {
    const trimmedName = input.name.trim()
    if (!trimmedName) {
      toast.error('Dashboard name is required.')
      return
    }

    const viewId = createDashboardViewId(Date.now())
    const nextState: DashboardViewsState = {
      view_order: [...state.view_order, viewId],
      views: {
        ...state.views,
        [viewId]: {
          id: viewId,
          name: trimmedName,
          icon: input.icon,
          layout: createEmptyLayout()
        }
      }
    }

    setState(nextState)
    setResolvedActiveViewId(nextState, viewId)
    window.api
      .invoke(IPC.SETTINGS_SET_DASHBOARD_VIEWS, { state: nextState } satisfies DashboardViewsMutation)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to create dashboard.')
      })
  }

  const updateDashboardViewMeta = (
    viewId: string,
    input: { name: string; icon: DashboardIcon | null }
  ): void => {
    const view = state.views[viewId]
    if (!view) {
      return
    }

    const trimmedName = input.name.trim()
    if (!trimmedName) {
      toast.error('Dashboard name is required.')
      return
    }

    const nextState: DashboardViewsState = {
      ...state,
      views: {
        ...state.views,
        [viewId]: {
          ...view,
          name: trimmedName,
          icon: input.icon
        }
      }
    }

    persistState(nextState)
  }

  const duplicateDashboardView = (viewId: string): void => {
    const sourceView = state.views[viewId]
    if (!sourceView) {
      return
    }

    const duplicateViewId = createDashboardViewId(Date.now())
    const { layout, cloneOperations } = cloneLayoutWithNewInstanceIds(sourceView.layout)
    const sourceIndex = state.view_order.indexOf(viewId)
    const insertAt = sourceIndex >= 0 ? sourceIndex + 1 : state.view_order.length
    const duplicateName = `${sourceView.name} Copy`
    const nextOrder = [...state.view_order]
    nextOrder.splice(insertAt, 0, duplicateViewId)

    const nextState: DashboardViewsState = {
      view_order: nextOrder,
      views: {
        ...state.views,
        [duplicateViewId]: {
          id: duplicateViewId,
          name: duplicateName,
          icon: sourceView.icon,
          layout
        }
      }
    }

    setState(nextState)
    setResolvedActiveViewId(nextState, duplicateViewId)
    window.api
      .invoke(IPC.SETTINGS_SET_DASHBOARD_VIEWS, {
        state: nextState,
        cloneInstanceConfigs: cloneOperations
      } satisfies DashboardViewsMutation)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to duplicate dashboard.')
      })
  }

  const deleteDashboardView = (viewId: string): void => {
    if (state.view_order.length <= 1) {
      toast.error('You must keep at least one dashboard.')
      return
    }

    const view = state.views[viewId]
    if (!view) {
      return
    }

    const { [viewId]: _removedView, ...remainingViews } = state.views
    const nextState: DashboardViewsState = {
      view_order: state.view_order.filter((id) => id !== viewId),
      views: remainingViews
    }

    const deleteInstanceIds = Object.keys(view.layout.widget_instances)
    setState(nextState)
    setResolvedActiveViewId(nextState, nextState.view_order[0] ?? null)
    window.api
      .invoke(IPC.SETTINGS_SET_DASHBOARD_VIEWS, {
        state: nextState,
        deleteInstanceIds
      } satisfies DashboardViewsMutation)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete dashboard.')
      })
  }

  const moveDashboardView = (viewId: string, direction: 'left' | 'right'): void => {
    const index = state.view_order.indexOf(viewId)
    if (index < 0) {
      return
    }

    const targetIndex = direction === 'left' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= state.view_order.length) {
      return
    }

    const nextState: DashboardViewsState = {
      ...state,
      view_order: arrayMove(state.view_order, index, targetIndex)
    }

    persistState(nextState)
  }

  const moveWidgetToView = ({
    sourceViewId,
    targetViewId,
    instanceId,
    position = 'bottom',
    switchToTarget = false
  }: CrossViewWidgetTransferInput): boolean => {
    if (sourceViewId === targetViewId) {
      toast.error('Choose a different dashboard.')
      return false
    }

    const sourceView = state.views[sourceViewId]
    const targetView = state.views[targetViewId]
    if (!sourceView || !targetView) {
      toast.error('Unable to find the selected dashboard.')
      return false
    }

    const widgetInstance = sourceView.layout.widget_instances[instanceId]
    if (!widgetInstance) {
      toast.error('Unable to find that widget in the current dashboard.')
      return false
    }

    const sourceVisibility = sourceView.layout.widget_visibility[instanceId] ?? true
    const { [instanceId]: _removedInstance, ...remainingInstances } = sourceView.layout.widget_instances
    const { [instanceId]: _removedVisibility, ...remainingVisibility } = sourceView.layout.widget_visibility

    const nextSourceLayout: WidgetLayout = {
      widget_order: sourceView.layout.widget_order.filter((id) => id !== instanceId),
      widget_instances: remainingInstances,
      widget_visibility: remainingVisibility
    }

    const nextTargetLayout: WidgetLayout = {
      widget_order: insertWidgetInstance(targetView.layout.widget_order, instanceId, position),
      widget_instances: {
        ...targetView.layout.widget_instances,
        [instanceId]: widgetInstance
      },
      widget_visibility: {
        ...targetView.layout.widget_visibility,
        [instanceId]: sourceVisibility
      }
    }

    const nextState: DashboardViewsState = {
      ...state,
      views: {
        ...state.views,
        [sourceViewId]: {
          ...sourceView,
          layout: nextSourceLayout
        },
        [targetViewId]: {
          ...targetView,
          layout: nextTargetLayout
        }
      }
    }

    persistState(nextState, undefined, switchToTarget ? targetViewId : sourceViewId)
    return true
  }

  const copyWidgetToView = ({
    sourceViewId,
    targetViewId,
    instanceId,
    position = 'bottom',
    switchToTarget = false
  }: CrossViewWidgetTransferInput): boolean => {
    if (sourceViewId === targetViewId) {
      toast.error('Choose a different dashboard.')
      return false
    }

    const sourceView = state.views[sourceViewId]
    const targetView = state.views[targetViewId]
    if (!sourceView || !targetView) {
      toast.error('Unable to find the selected dashboard.')
      return false
    }

    const widgetInstance = sourceView.layout.widget_instances[instanceId]
    if (!widgetInstance) {
      toast.error('Unable to find that widget in the current dashboard.')
      return false
    }

    const nextInstanceId = createWidgetInstanceId(widgetInstance.moduleId, Date.now())
    const nextWidgetInstance: WidgetInstance = {
      ...widgetInstance,
      instanceId: nextInstanceId
    }

    const nextTargetLayout: WidgetLayout = {
      widget_order: insertWidgetInstance(targetView.layout.widget_order, nextInstanceId, position),
      widget_instances: {
        ...targetView.layout.widget_instances,
        [nextInstanceId]: nextWidgetInstance
      },
      widget_visibility: {
        ...targetView.layout.widget_visibility,
        [nextInstanceId]: sourceView.layout.widget_visibility[instanceId] ?? true
      }
    }

    const nextState: DashboardViewsState = {
      ...state,
      views: {
        ...state.views,
        [targetViewId]: {
          ...targetView,
          layout: nextTargetLayout
        }
      }
    }

    persistState(
      nextState,
      {
        cloneInstanceConfigs: [
          {
            sourceInstanceId: instanceId,
            targetInstanceId: nextInstanceId
          }
        ]
      },
      switchToTarget ? targetViewId : sourceViewId
    )
    return true
  }

  return {
    dashboardViews,
    activeViewId,
    activeView,
    setActiveViewId,
    setActiveLayout,
    createDashboardView,
    updateDashboardViewMeta,
    duplicateDashboardView,
    deleteDashboardView,
    moveDashboardView,
    moveWidgetToView,
    copyWidgetToView,
    loading
  }
}
