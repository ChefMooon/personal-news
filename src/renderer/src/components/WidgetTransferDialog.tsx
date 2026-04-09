import React, { useEffect, useMemo, useState } from 'react'
import type { DashboardView } from '../../../shared/ipc-types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { getModule } from '../modules/registry'

type WidgetTransferMode = 'move' | 'copy'
type WidgetTransferPosition = 'top' | 'bottom' | { afterId: string }

interface WidgetTransferDialogProps {
  open: boolean
  currentViewId: string
  dashboardViews: DashboardView[]
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    mode: WidgetTransferMode
    targetViewId: string
    position: WidgetTransferPosition
    switchToTarget: boolean
  }) => boolean
}

export function WidgetTransferDialog({
  open,
  currentViewId,
  dashboardViews,
  onOpenChange,
  onSubmit
}: WidgetTransferDialogProps): React.ReactElement {
  const availableViews = useMemo(
    () => dashboardViews.filter((view) => view.id !== currentViewId),
    [currentViewId, dashboardViews]
  )
  const [mode, setMode] = useState<WidgetTransferMode>('move')
  const [targetViewId, setTargetViewId] = useState('')
  const [positionValue, setPositionValue] = useState('bottom')
  const [switchToTarget, setSwitchToTarget] = useState(false)

  const selectedTargetView = useMemo(
    () => availableViews.find((view) => view.id === targetViewId) ?? null,
    [availableViews, targetViewId]
  )

  const positionOptions = useMemo(() => {
    const targetLayout = selectedTargetView?.layout
    if (!targetLayout) {
      return [{ value: 'bottom', label: 'Bottom of dashboard' }]
    }

    const options: Array<{ value: string; label: string }> = [
      { value: 'top', label: 'Top of dashboard' }
    ]

    for (const instanceId of targetLayout.widget_order) {
      if (targetLayout.widget_visibility[instanceId] === false) {
        continue
      }

      const instance = targetLayout.widget_instances[instanceId]
      if (!instance) {
        continue
      }

      const mod = getModule(instance.moduleId)
      const widgetLabel = instance.label ?? mod?.displayName ?? instanceId
      options.push({ value: `after:${instanceId}`, label: `After "${widgetLabel}"` })
    }

    options.push({ value: 'bottom', label: 'Bottom of dashboard' })
    return options
  }, [selectedTargetView])

  useEffect(() => {
    if (!open) {
      return
    }

    setMode('move')
    setTargetViewId(availableViews[0]?.id ?? '')
    setPositionValue('bottom')
    setSwitchToTarget(false)
  }, [availableViews, open])

  useEffect(() => {
    if (!selectedTargetView) {
      return
    }

    const optionValues = new Set(positionOptions.map((option) => option.value))
    if (!optionValues.has(positionValue)) {
      setPositionValue(positionOptions[positionOptions.length - 1]?.value ?? 'bottom')
    }
  }, [positionOptions, positionValue, selectedTargetView])

  const hasTargets = availableViews.length > 0
  const description =
    mode === 'move'
      ? 'Move this widget to another dashboard and optionally switch there right away.'
      : 'Copy this widget to another dashboard with its current settings, then optionally switch there.'

  const handleSubmit = (): void => {
    if (!targetViewId) {
      return
    }

    const position: WidgetTransferPosition = positionValue.startsWith('after:')
      ? { afterId: positionValue.slice('after:'.length) }
      : positionValue === 'top'
        ? 'top'
        : 'bottom'

    if (onSubmit({ mode, targetViewId, position, switchToTarget })) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer widget</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {hasTargets ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="widget-transfer-mode" className="text-sm font-medium text-foreground">
                Action
              </label>
              <Select value={mode} onValueChange={(value) => setMode(value as WidgetTransferMode)}>
                <SelectTrigger id="widget-transfer-mode" aria-label="Transfer action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="move">Move to dashboard</SelectItem>
                  <SelectItem value="copy">Copy to dashboard</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="widget-transfer-destination" className="text-sm font-medium text-foreground">
                Destination
              </label>
              <Select value={targetViewId} onValueChange={setTargetViewId}>
                <SelectTrigger id="widget-transfer-destination" aria-label="Destination dashboard">
                  <SelectValue placeholder="Choose a dashboard" />
                </SelectTrigger>
                <SelectContent>
                  {availableViews.map((view) => (
                    <SelectItem key={view.id} value={view.id}>
                      {view.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="widget-transfer-position" className="text-sm font-medium text-foreground">
                Insert at
              </label>
              <Select value={positionValue} onValueChange={setPositionValue}>
                <SelectTrigger id="widget-transfer-position" aria-label="Insertion position">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Switch after transfer</p>
                <p className="text-xs text-muted-foreground">
                  Open the destination dashboard after the action completes.
                </p>
              </div>
              <Switch
                checked={switchToTarget}
                onCheckedChange={setSwitchToTarget}
                aria-label="Switch to destination dashboard after transfer"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-4 text-sm text-muted-foreground">
            Create another dashboard first. There is nowhere to move or copy this widget yet.
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!hasTargets || !targetViewId}>
            {mode === 'move' ? 'Move widget' : 'Copy widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}