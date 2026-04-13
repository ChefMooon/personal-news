import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Plus } from 'lucide-react'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Switch } from '../../components/ui/switch'
import { Separator } from '../../components/ui/separator'
import { ScrollArea } from '../../components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import type { WeatherLocation, WeatherSearchResult, WeatherSettings, WeatherViewConfig } from '../../../../shared/ipc-types'

interface WeatherSettingsPanelProps {
  config: WeatherViewConfig
  onChange: (config: WeatherViewConfig) => void
  locations: WeatherLocation[]
  defaultLocationId: string | null
  settings: WeatherSettings
  onSearch: (query: string) => Promise<WeatherSearchResult[]>
  onSaveLocation: (location: WeatherSearchResult) => Promise<WeatherLocation | null>
}

function formatLocationLabel(location: Pick<WeatherLocation, 'name' | 'admin1' | 'country'>): string {
  return [location.name, location.admin1, location.country].filter(Boolean).join(', ')
}

export function WeatherSettingsPanel({
  config,
  onChange,
  locations,
  defaultLocationId,
  settings,
  onSearch,
  onSaveLocation
}: WeatherSettingsPanelProps): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<WeatherSearchResult[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const currentValue = config.locationId ?? '__default__'
  const defaultLocationLabel = useMemo(() => {
    if (!defaultLocationId) return 'No default location selected'
    const currentDefault = locations.find((location) => location.id === defaultLocationId)
    return currentDefault ? formatLocationLabel(currentDefault) : 'Use app default location'
  }, [defaultLocationId, locations])

  const runSearch = async (): Promise<void> => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return
    setSearching(true)
    const results = await onSearch(trimmed)
    setSearchResults(results)
    setSearching(false)
  }

  const addAndSelectLocation = async (result: WeatherSearchResult): Promise<void> => {
    setSavingId(result.id)
    const saved = await onSaveLocation(result)
    setSavingId(null)
    if (!saved) return
    onChange({ ...config, locationId: saved.id })
    toast.success(`Saved ${formatLocationLabel(saved)}.`)
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 flex-1">
      <ScrollArea className="h-full w-full">
        <div className="space-y-5 pb-2 pr-4">
          <div>
            <h3 className="text-sm font-semibold mb-3">Location</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-2">Displayed location</label>
                <Select
                  value={currentValue}
                  onValueChange={(value) => onChange({
                    ...config,
                    locationId: value === '__default__' ? null : value
                  })}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Use app default: {defaultLocationLabel}</SelectItem>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {formatLocationLabel(location)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label htmlFor="weather-location-search" className="text-sm block mb-2">
                  Search and add location
                </label>
                <div className="flex gap-2">
                  <Input
                    id="weather-location-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="City, region, or country"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => void runSearch()} disabled={searching}>
                    <Search className="h-4 w-4 mr-1" />
                    {searching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div key={result.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{formatLocationLabel(result)}</p>
                          <p className="text-xs text-muted-foreground truncate">{result.latitude.toFixed(2)}, {result.longitude.toFixed(2)} • {result.timezone}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void addAndSelectLocation(result)}
                          disabled={savingId === result.id}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          {savingId === result.id ? 'Adding...' : 'Use'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Display</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm block mb-2">Detail level</label>
                <Select
                  value={config.detailLevel}
                  onValueChange={(value) => onChange({
                    ...config,
                    detailLevel: value as WeatherViewConfig['detailLevel']
                  })}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="summary">Summary</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm block mb-2">Display mode</label>
                <Select
                  value={config.displayMode}
                  onValueChange={(value) => onChange({
                    ...config,
                    displayMode: value as WeatherViewConfig['displayMode']
                  })}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current only</SelectItem>
                    <SelectItem value="current_all">Current + all</SelectItem>
                    <SelectItem value="current_hourly">Current + hourly</SelectItem>
                    <SelectItem value="current_daily">Current + daily</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3">Sections</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm">Show alerts banner</label>
                <Switch
                  checked={config.showAlerts && settings.showAlertsInWidgets}
                  onCheckedChange={(checked) => onChange({ ...config, showAlerts: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Show precipitation</label>
                <Switch
                  checked={config.showPrecipitation}
                  onCheckedChange={(checked) => onChange({ ...config, showPrecipitation: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Show wind and gusts</label>
                <Switch
                  checked={config.showWind}
                  onCheckedChange={(checked) => onChange({ ...config, showWind: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Show humidity</label>
                <Switch
                  checked={config.showHumidity}
                  onCheckedChange={(checked) => onChange({ ...config, showHumidity: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Show feels-like temperature</label>
                <Switch
                  checked={config.showFeelsLike}
                  onCheckedChange={(checked) => onChange({ ...config, showFeelsLike: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Show sunrise and sunset</label>
                <Switch
                  checked={config.showSunTimes}
                  onCheckedChange={(checked) => onChange({ ...config, showSunTimes: checked })}
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}