import React, { useEffect, useState } from 'react'
import type { DashboardIcon } from '../../../shared/ipc-types'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { DashboardGlyph, DASHBOARD_ICON_OPTIONS } from '../lib/dashboard-icons'

interface DashboardViewDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initialName: string
  initialIcon: DashboardIcon | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { name: string; icon: DashboardIcon | null }) => void
}

export function DashboardViewDialog({
  open,
  mode,
  initialName,
  initialIcon,
  onOpenChange,
  onSubmit
}: DashboardViewDialogProps): React.ReactElement {
  const [name, setName] = useState(initialName)
  const [iconValue, setIconValue] = useState<DashboardIcon | null>(initialIcon)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setName(initialName)
    setIconValue(initialIcon)
    setError(null)
  }, [initialIcon, initialName, open])

  const title = mode === 'create' ? 'Create dashboard' : 'Edit dashboard'
  const description =
    mode === 'create'
      ? 'Create a new empty dashboard and optionally choose an icon for its tab.'
      : 'Update the dashboard name and the optional icon shown in its tab.'

  const handleSubmit = (): void => {
    if (name.trim().length === 0) {
      setError('Dashboard name is required.')
      return
    }

    onSubmit({
      name: name.trim(),
      icon: iconValue
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="dashboard-view-name" className="text-sm font-medium text-foreground">
              Name
            </label>
            <Input
              id="dashboard-view-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                if (error) {
                  setError(null)
                }
              }}
              placeholder="My dashboard"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="dashboard-view-icon" className="text-sm font-medium text-foreground">
              Icon
            </label>
            <Select
              value={iconValue ?? 'none'}
              onValueChange={(value) => setIconValue(value === 'none' ? null : (value as DashboardIcon))}
            >
              <SelectTrigger id="dashboard-view-icon" aria-label="Dashboard icon">
                <SelectValue placeholder="No icon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No icon</SelectItem>
                {DASHBOARD_ICON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="inline-flex items-center gap-2">
                      <DashboardGlyph icon={option.value} className="h-4 w-4" />
                      <span>{option.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {mode === 'create' ? 'Create dashboard' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}