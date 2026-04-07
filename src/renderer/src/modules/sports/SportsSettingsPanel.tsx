import React from 'react'
import { Switch } from '../../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import type { SportsViewConfig } from '../../../../shared/ipc-types'

export function SportsSettingsPanel({
  config,
  setConfig
}: {
  config: SportsViewConfig
  setConfig: (config: SportsViewConfig) => void
}): React.ReactElement {
  return (
    <div className="flex w-full flex-col gap-4 overflow-y-auto pr-1">
      <div>
        <h3 className="text-sm font-medium">Widget Settings</h3>
        <p className="text-xs text-muted-foreground">Controls for this Sports widget instance.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Sport</label>
        <Select value={config.sport} onValueChange={(value) => setConfig({ ...config, sport: value })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent align="start" side="bottom">
            <SelectItem value="Baseball">Baseball</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">View</label>
        <Select
          value={config.viewMode}
          onValueChange={(value) => setConfig({ ...config, viewMode: value as SportsViewConfig['viewMode'] })}
        >
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent align="start" side="bottom">
            <SelectItem value="all_games">All Games</SelectItem>
            <SelectItem value="my_teams">My Teams</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
          <p className="text-sm">Show local game times</p>
          <p className="text-xs text-muted-foreground">Use your local timezone for scheduled games.</p>
        </div>
        <Switch checked={config.showTime} onCheckedChange={(checked) => setConfig({ ...config, showTime: checked })} />
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <div>
          <p className="text-sm">Show venue</p>
          <p className="text-xs text-muted-foreground">Include venue names when available.</p>
        </div>
        <Switch checked={config.showVenue} onCheckedChange={(checked) => setConfig({ ...config, showVenue: checked })} />
      </div>
    </div>
  )
}

export default SportsSettingsPanel