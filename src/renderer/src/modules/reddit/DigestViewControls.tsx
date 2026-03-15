import React from 'react'
import type { DigestViewConfig } from '../../../../shared/ipc-types'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'

interface DigestViewControlsProps {
  config: DigestViewConfig
  onChange: (config: DigestViewConfig) => void
}

const SORT_OPTIONS: { value: DigestViewConfig['sort_by']; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'num_comments', label: 'Comments' },
  { value: 'created_utc', label: 'Age' },
  { value: 'fetched_at', label: 'Date Collected' }
]

export function DigestViewControls({ config, onChange }: DigestViewControlsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      {/* Sort select */}
      <Select
        value={config.sort_by}
        onValueChange={(val) =>
          onChange({ ...config, sort_by: val as DigestViewConfig['sort_by'] })
        }
      >
        <SelectTrigger className="h-7 text-xs w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sort direction toggle */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() =>
          onChange({ ...config, sort_dir: config.sort_dir === 'desc' ? 'asc' : 'desc' })
        }
      >
        {config.sort_dir === 'desc' ? '↓' : '↑'}
      </Button>

      {/* Layout toggle: columns / tabs */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs px-2"
        onClick={() =>
          onChange({
            ...config,
            layout_mode: config.layout_mode === 'columns' ? 'tabs' : 'columns'
          })
        }
        title={config.layout_mode === 'columns' ? 'Switch to tabs' : 'Switch to columns'}
      >
        {config.layout_mode === 'columns' ? (
          <LayoutGrid className="h-3.5 w-3.5" />
        ) : (
          <List className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  )
}
