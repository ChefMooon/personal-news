import React, { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { useWidgetLayout } from '../hooks/useWidgetLayout'
import { WidgetWrapper } from '../components/WidgetWrapper'
import { WidgetTransferDialog } from '../components/WidgetTransferDialog'
import { getModule } from '../modules/registry'
import { Button } from '../components/ui/button'
import {
  ArrowLeft,
  ArrowRightLeft,
  ArrowRight,
  Check,
  Copy,
  Pencil,
  Plus,
  Settings2,
  Trash2
} from 'lucide-react'
import { WidgetInstanceContext } from '../contexts/WidgetInstanceContext'
import { DashboardTransferContext } from '../contexts/DashboardTransferContext'
import { AddWidgetModal, type AddWidgetConfig } from '../components/AddWidgetModal'
import { useSavedPostsEnabled } from '../contexts/SavedPostsEnabledContext'
import { useRedditDigestEnabled } from '../contexts/RedditDigestEnabledContext'
import { useSportsEnabled } from '../contexts/SportsEnabledContext'
import { useWeatherEnabled } from '../contexts/WeatherEnabledContext'
import { normalizeSportsViewConfig } from '../hooks/useSportsViewConfig'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { DashboardGlyph } from '../lib/dashboard-icons'
import { DashboardViewDialog } from '../components/DashboardViewDialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { IPC, type DashboardIcon, type IpcMutationResult, type SportsSettings, type SportsViewConfig, type SportSyncStatus } from '../../../shared/ipc-types'
import {
  ALL_SPORTS_ID,
  DEFAULT_SPORTS_STARTUP_REFRESH_STALE_MINUTES,
  SUPPORTED_SPORTS,
  isSupportedSport,
  normalizeSportsStartupRefreshStaleMinutes,
  type SupportedSport
} from '../../../shared/sports'

const DASHBOARD_TAB_DROP_PREFIX = 'dashboard-tab:'
const DASHBOARD_INSERT_DROP_PREFIX = 'dashboard-insert:'
const TAB_AUTO_SWITCH_DELAY_MS = 450

function getSportsForWidget(rawConfig: unknown): SupportedSport[] {
  let parsedConfig: Partial<SportsViewConfig> = {}

  if (typeof rawConfig === 'string') {
    try {
      parsedConfig = JSON.parse(rawConfig) as Partial<SportsViewConfig>
    } catch {
      parsedConfig = {}
    }
  }

  const normalizedConfig = normalizeSportsViewConfig(parsedConfig)
  if (normalizedConfig.sport === ALL_SPORTS_ID) {
    return SUPPORTED_SPORTS
  }

  return isSupportedSport(normalizedConfig.sport) ? [normalizedConfig.sport] : []
}

function isSportStatusStale(status: SportSyncStatus | undefined, staleAfterMs: number): boolean {
  if (status?.lastFetchedAt == null) {
    return true
  }

  return Date.now() - status.lastFetchedAt * 1000 >= staleAfterMs
}

function getDashboardTabDropViewId(rawId: string): string | null {
  return rawId.startsWith(DASHBOARD_TAB_DROP_PREFIX)
    ? rawId.slice(DASHBOARD_TAB_DROP_PREFIX.length)
    : null
}

function createDashboardInsertDropId(viewId: string, position: 'top' | 'bottom' | { afterId: string }): string {
  if (position === 'top') {
    return `${DASHBOARD_INSERT_DROP_PREFIX}${viewId}:top`
  }

  if (position === 'bottom') {
    return `${DASHBOARD_INSERT_DROP_PREFIX}${viewId}:bottom`
  }

  return `${DASHBOARD_INSERT_DROP_PREFIX}${viewId}:after:${position.afterId}`
}

function parseDashboardInsertDropTarget(rawId: string): { viewId: string; position: 'top' | 'bottom' | { afterId: string } } | null {
  if (!rawId.startsWith(DASHBOARD_INSERT_DROP_PREFIX)) {
    return null
  }

  const payload = rawId.slice(DASHBOARD_INSERT_DROP_PREFIX.length)
  const [viewId, mode, ...rest] = payload.split(':')
  if (!viewId || !mode) {
    return null
  }

  if (mode === 'top') {
    return { viewId, position: 'top' }
  }

  if (mode === 'bottom') {
    return { viewId, position: 'bottom' }
  }

  if (mode === 'after') {
    const afterId = rest.join(':')
    if (!afterId) {
      return null
    }
    return { viewId, position: { afterId } }
  }

  return null
}

function DashboardTabDropTarget({
  viewId,
  disabled,
  children
}: {
  viewId: string
  disabled: boolean
  children: React.ReactNode
}): React.ReactElement {
  const { isOver, setNodeRef } = useDroppable({
    id: `${DASHBOARD_TAB_DROP_PREFIX}${viewId}`,
    disabled
  })

  return (
    <div
      ref={setNodeRef}
      className={isOver && !disabled ? 'rounded-lg ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : undefined}
    >
      {children}
    </div>
  )
}

function DashboardInsertionDropTarget({
  dropId,
  label,
  visible
}: {
  dropId: string
  label: string
  visible: boolean
}): React.ReactElement | null {
  const { isOver, setNodeRef } = useDroppable({
    id: dropId,
    disabled: !visible
  })

  if (!visible) {
    return null
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'my-1 rounded-md border border-dashed px-3 py-1.5 text-xs transition-colors',
        isOver
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border/70 bg-muted/20 text-muted-foreground'
      ].join(' ')}
      aria-label={label}
    >
      {label}
    </div>
  )
}

// Import modules to trigger registration
import '../modules/youtube/YouTubeWidget'
import '../modules/reddit/RedditDigestWidget'
import '../modules/saved-posts/SavedPostsWidget'
import '../modules/sports'
import '../modules/weather/WeatherWidget'

export default function Dashboard(): React.ReactElement {
  const {
    dashboardViews,
    activeView,
    activeViewId,
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
  } = useWidgetLayout()
  const { enabled: redditDigestEnabled } = useRedditDigestEnabled()
  const { enabled: savedPostsEnabled } = useSavedPostsEnabled()
  const { enabled: sportsEnabled } = useSportsEnabled()
  const { enabled: weatherEnabled } = useWeatherEnabled()
  const [editMode, setEditMode] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [dashboardDialogMode, setDashboardDialogMode] = useState<'create' | 'edit' | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [transferDialogWidgetId, setTransferDialogWidgetId] = useState<string | null>(null)
  const [dragSourceViewId, setDragSourceViewId] = useState<string | null>(null)
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null)
  const tabSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTabSwitchViewIdRef = useRef<string | null>(null)
  const initialDashboardViewIdRef = useRef<string | null>(null)
  const startupSportsRefreshHandledRef = useRef(false)

  const layout = activeView.layout
  const activeViewIndex = dashboardViews.findIndex((view) => view.id === activeViewId)
  const canMoveViewLeft = activeViewIndex > 0
  const canMoveViewRight = activeViewIndex >= 0 && activeViewIndex < dashboardViews.length - 1
  const canDeleteView = dashboardViews.length > 1
  const showingCrossViewInsertTargets = draggingWidgetId !== null && dragSourceViewId !== null && activeViewId !== dragSourceViewId

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  useEffect(() => {
    return () => {
      if (tabSwitchTimerRef.current) {
        clearTimeout(tabSwitchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (loading || initialDashboardViewIdRef.current !== null) {
      return
    }

    initialDashboardViewIdRef.current = activeViewId
  }, [activeViewId, loading])

  useEffect(() => {
    if (loading || startupSportsRefreshHandledRef.current) {
      return
    }

    const initialDashboardViewId = initialDashboardViewIdRef.current ?? activeViewId
    if (activeViewId !== initialDashboardViewId) {
      return
    }

    startupSportsRefreshHandledRef.current = true

    if (!sportsEnabled) {
      return
    }

    const sportsWidgetInstanceIds = Object.values(activeView.layout.widget_instances)
      .filter((instance) => instance.moduleId === 'sports')
      .map((instance) => instance.instanceId)

    if (sportsWidgetInstanceIds.length === 0) {
      return
    }

    let cancelled = false

    const refreshInitialDashboardSports = async (): Promise<void> => {
      try {
        const [rawConfigs, statusList, sportsSettings] = await Promise.all([
          Promise.all(
            sportsWidgetInstanceIds.map((instanceId) => window.api.invoke(IPC.SETTINGS_GET, `sports_view_config:${instanceId}`))
          ),
          window.api.invoke(IPC.SPORTS_GET_STATUS),
          window.api.invoke(IPC.SETTINGS_GET_SPORTS_SETTINGS)
        ])

        if (cancelled) {
          return
        }

        const selectedSports = new Set<SupportedSport>()
        for (const rawConfig of rawConfigs) {
          for (const sport of getSportsForWidget(rawConfig)) {
            selectedSports.add(sport)
          }
        }

        if (selectedSports.size === 0) {
          return
        }

        const statusBySport = new Map(
          (statusList as SportSyncStatus[]).map((status) => [status.sport, status] as const)
        )
        const startupRefreshStaleMinutes = normalizeSportsStartupRefreshStaleMinutes(
          (sportsSettings as Partial<SportsSettings>).startupRefreshStaleMinutes ?? DEFAULT_SPORTS_STARTUP_REFRESH_STALE_MINUTES
        )
        const startupRefreshStaleAfterMs = startupRefreshStaleMinutes * 60 * 1000
        const staleSports = Array.from(selectedSports).filter((sport) =>
          isSportStatusStale(statusBySport.get(sport), startupRefreshStaleAfterMs)
        )

        if (staleSports.length === 0) {
          return
        }

        const results = (await Promise.all(
          staleSports.map((sport) => window.api.invoke(IPC.SPORTS_REFRESH, { sport }))
        )) as IpcMutationResult[]
        const failed = results.find((result) => !result.ok)

        if (failed) {
          console.error('[Dashboard] Startup sports refresh failed:', failed.error ?? 'Unknown error')
        }
      } catch (error) {
        console.error('[Dashboard] Failed to refresh startup sports widgets:', error)
      }
    }

    void refreshInitialDashboardSports()

    return () => {
      cancelled = true
    }
  }, [activeView, activeViewId, loading, sportsEnabled])

  function clearPendingTabSwitch(): void {
    if (tabSwitchTimerRef.current) {
      clearTimeout(tabSwitchTimerRef.current)
      tabSwitchTimerRef.current = null
    }
    pendingTabSwitchViewIdRef.current = null
  }

  function scheduleTabAutoSwitch(viewId: string): void {
    if (pendingTabSwitchViewIdRef.current === viewId || activeViewId === viewId) {
      return
    }

    clearPendingTabSwitch()
    pendingTabSwitchViewIdRef.current = viewId
    tabSwitchTimerRef.current = setTimeout(() => {
      pendingTabSwitchViewIdRef.current = null
      tabSwitchTimerRef.current = null
      setActiveViewId(viewId)
    }, TAB_AUTO_SWITCH_DELAY_MS)
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    const activeId = active.id as string
    const sourceViewId = dragSourceViewId ?? activeViewId
    clearPendingTabSwitch()
    setDragSourceViewId(null)
    setDraggingWidgetId(null)

    if (!over) return

    const insertTarget = parseDashboardInsertDropTarget(String(over.id))
    if (insertTarget && insertTarget.viewId !== sourceViewId) {
      moveWidgetToView({
        sourceViewId,
        targetViewId: insertTarget.viewId,
        instanceId: activeId,
        position: insertTarget.position,
        switchToTarget: true
      })
      return
    }

    const targetTabViewId = getDashboardTabDropViewId(String(over.id))
    if (targetTabViewId && targetTabViewId !== activeViewId) {
      const switchToTarget = targetTabViewId !== sourceViewId
      moveWidgetToView({
        sourceViewId,
        targetViewId: targetTabViewId,
        instanceId: activeId,
        switchToTarget
      })
      return
    }

    if (sourceViewId !== activeViewId) {
      if (layout.widget_order.includes(String(over.id))) {
        moveWidgetToView({
          sourceViewId,
          targetViewId: activeViewId,
          instanceId: activeId,
          position: { afterId: String(over.id) },
          switchToTarget: true
        })
      }
      return
    }

    if (active.id === over.id) return

    const oldIndex = layout.widget_order.indexOf(activeId)
    const newIndex = layout.widget_order.indexOf(over.id as string)
    const newOrder = arrayMove(layout.widget_order, oldIndex, newIndex)

    setActiveLayout({ ...layout, widget_order: newOrder })
  }

  function handleDragStart(event: DragStartEvent): void {
    const activeId = event.active.id as string
    if (!layout.widget_order.includes(activeId)) {
      return
    }

    setDragSourceViewId(activeViewId)
    setDraggingWidgetId(activeId)
  }

  function handleDragOver(event: DragOverEvent): void {
    const overId = event.over?.id
    if (!overId || dragSourceViewId === null) {
      clearPendingTabSwitch()
      return
    }

    const targetTabViewId = getDashboardTabDropViewId(String(overId))
    if (targetTabViewId && targetTabViewId !== activeViewId) {
      scheduleTabAutoSwitch(targetTabViewId)
      return
    }

    clearPendingTabSwitch()
  }

  function handleToggleVisibility(instanceId: string): void {
    setActiveLayout({
      ...layout,
      widget_visibility: {
        ...layout.widget_visibility,
        [instanceId]: !layout.widget_visibility[instanceId]
      }
    })
  }

  function handleRename(instanceId: string, newLabel: string | null): void {
    setActiveLayout({
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
    setActiveLayout(
      {
        ...layout,
        widget_order: layout.widget_order.filter((id) => id !== instanceId),
        widget_visibility: remainingVisibility,
        widget_instances: remainingInstances
      },
      { deleteInstanceIds: [instanceId] }
    )
  }

  function handleMoveUp(instanceId: string): void {
    const index = layout.widget_order.indexOf(instanceId)
    if (index <= 0) return
    setActiveLayout({ ...layout, widget_order: arrayMove(layout.widget_order, index, index - 1) })
  }

  function handleMoveDown(instanceId: string): void {
    const index = layout.widget_order.indexOf(instanceId)
    if (index < 0 || index >= layout.widget_order.length - 1) return
    setActiveLayout({ ...layout, widget_order: arrayMove(layout.widget_order, index, index + 1) })
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

    setActiveLayout({
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

  function handleDashboardDialogSubmit(input: { name: string; icon: DashboardIcon | null }): void {
    if (dashboardDialogMode === 'create') {
      createDashboardView(input)
      return
    }

    updateDashboardViewMeta(activeView.id, input)
  }

  function handleTransferSubmit(input: {
    mode: 'move' | 'copy'
    targetViewId: string
    position: 'top' | 'bottom' | { afterId: string }
    switchToTarget: boolean
  }): boolean {
    if (!transferDialogWidgetId) {
      return false
    }

    if (input.mode === 'move') {
      return moveWidgetToView({
        sourceViewId: activeViewId,
        targetViewId: input.targetViewId,
        instanceId: transferDialogWidgetId,
        position: input.position,
        switchToTarget: input.switchToTarget
      })
    }

    return copyWidgetToView({
      sourceViewId: activeViewId,
      targetViewId: input.targetViewId,
      instanceId: transferDialogWidgetId,
      position: input.position,
      switchToTarget: input.switchToTarget
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading dashboard...</p>
      </div>
    )
  }

  return (
    <DashboardTransferContext.Provider
      value={{
        openTransferDialog: (instanceId) => setTransferDialogWidgetId(instanceId)
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerHits = pointerWithin(args)
          if (pointerHits.length > 0) {
            return pointerHits
          }
          return closestCenter(args)
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="min-h-full flex flex-col">
          <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-col gap-4 px-6 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-xl font-semibold">Dashboard</h1>
                  <p className="text-sm text-muted-foreground">
                    Switch between custom dashboard views focused on different subjects.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Button variant="outline" size="sm" onClick={() => setDashboardDialogMode('create')}>
                    <Plus className="mr-1 h-4 w-4" />
                    New Dashboard
                  </Button>
                  {editMode && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddModal(true)}
                        title="Add widget"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Add Widget
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDashboardDialogMode('edit')}>
                        <Pencil className="mr-1 h-4 w-4" />
                        Edit Tab
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => duplicateDashboardView(activeView.id)}>
                        <Copy className="mr-1 h-4 w-4" />
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveDashboardView(activeView.id, 'left')}
                        disabled={!canMoveViewLeft}
                      >
                        <ArrowLeft className="mr-1 h-4 w-4" />
                        Move Left
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => moveDashboardView(activeView.id, 'right')}
                        disabled={!canMoveViewRight}
                      >
                        <ArrowRight className="mr-1 h-4 w-4" />
                        Move Right
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={!canDeleteView}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete Dashboard
                      </Button>
                    </>
                  )}
                  <Button
                    variant={editMode ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditMode((value) => !value)}
                  >
                    {editMode ? (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        Done
                      </>
                    ) : (
                      <>
                        <Settings2 className="mr-1 h-4 w-4" />
                        Edit Layout
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <Tabs value={activeViewId} onValueChange={setActiveViewId}>
                <div className="overflow-x-auto pb-1">
                  <TabsList className="h-auto min-w-full justify-start gap-2 rounded-lg bg-muted/70 p-1">
                    {dashboardViews.map((view) => (
                      <DashboardTabDropTarget key={view.id} viewId={view.id} disabled={!editMode}>
                        <TabsTrigger
                          value={view.id}
                          className="shrink-0 gap-2 rounded-md border border-transparent px-4 py-2 data-[state=active]:border-border"
                          title={editMode ? 'Drop a widget here to move it to this dashboard.' : undefined}
                        >
                          {view.icon ? <DashboardGlyph icon={view.icon} className="h-4 w-4" /> : null}
                          <span className="max-w-[10rem] truncate">{view.name}</span>
                          {editMode ? <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground/70" /> : null}
                        </TabsTrigger>
                      </DashboardTabDropTarget>
                    ))}
                  </TabsList>
                </div>
              </Tabs>
            </div>
          </div>

          <div className="flex-1 p-6 space-y-6 w-full">
            {layout.widget_order.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-card/70 px-6 py-10 text-center">
                <h2 className="text-lg font-semibold">{activeView.name} is empty</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Add widgets to build a dashboard focused on this subject.
                </p>
                <DashboardInsertionDropTarget
                  dropId={createDashboardInsertDropId(activeViewId, 'top')}
                  label="Drop here to place at the top of this dashboard"
                  visible={showingCrossViewInsertTargets}
                />
                {editMode ? (
                  <Button className="mt-4" onClick={() => setShowAddModal(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add First Widget
                  </Button>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    Turn on Edit Layout to add widgets to this dashboard.
                  </p>
                )}
              </div>
            ) : (
              <SortableContext items={layout.widget_order} strategy={verticalListSortingStrategy}>
                {layout.widget_order.map((instanceId) => {
                  const instance = layout.widget_instances[instanceId]
                  if (!instance) return null
                  if (instance.moduleId === 'reddit_digest' && !redditDigestEnabled) return null
                  if (instance.moduleId === 'saved_posts' && !savedPostsEnabled) return null
                  if (instance.moduleId === 'sports' && !sportsEnabled) return null
                  if (instance.moduleId === 'weather' && !weatherEnabled) return null
                  const mod = getModule(instance.moduleId)
                  if (!mod) return null
                  const WidgetComponent = mod.widget
                  const widgetIndex = layout.widget_order.indexOf(instanceId)
                  return (
                    <React.Fragment key={instanceId}>
                      {widgetIndex === 0 ? (
                        <DashboardInsertionDropTarget
                          dropId={createDashboardInsertDropId(activeViewId, 'top')}
                          label="Drop here to place at the top of this dashboard"
                          visible={showingCrossViewInsertTargets}
                        />
                      ) : null}
                      <WidgetInstanceContext.Provider value={instance}>
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
                      <DashboardInsertionDropTarget
                        dropId={createDashboardInsertDropId(activeViewId, { afterId: instanceId })}
                        label={`Drop here to place after ${instance.label ?? mod.displayName}`}
                        visible={showingCrossViewInsertTargets}
                      />
                    </React.Fragment>
                  )
                })}
              </SortableContext>
            )}
          </div>

          {showAddModal && (
            <AddWidgetModal
              layout={layout}
              onAdd={handleAddFromModal}
              onClose={() => setShowAddModal(false)}
            />
          )}

          <DashboardViewDialog
            open={dashboardDialogMode !== null}
            mode={dashboardDialogMode ?? 'create'}
            initialName={dashboardDialogMode === 'edit' ? activeView.name : ''}
            initialIcon={dashboardDialogMode === 'edit' ? activeView.icon : null}
            onOpenChange={(open) => {
              if (!open) {
                setDashboardDialogMode(null)
              }
            }}
            onSubmit={handleDashboardDialogSubmit}
          />

          <WidgetTransferDialog
            open={transferDialogWidgetId !== null}
            currentViewId={activeViewId}
            dashboardViews={dashboardViews}
            onOpenChange={(open) => {
              if (!open) {
                setTransferDialogWidgetId(null)
              }
            }}
            onSubmit={handleTransferSubmit}
          />

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
                <AlertDialogDescription>
                  {canDeleteView
                    ? `Delete ${activeView.name} and remove any widget-specific saved settings tied only to this dashboard.`
                    : 'At least one dashboard must remain.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    deleteDashboardView(activeView.id)
                    setDeleteDialogOpen(false)
                  }}
                  disabled={!canDeleteView}
                >
                  Delete dashboard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DndContext>
    </DashboardTransferContext.Provider>
  )
}
