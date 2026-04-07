import React, { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CloudSun, MapPin, Plus, RefreshCcw, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Switch } from '../../components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { useWeatherLocations } from '../../hooks/useWeatherLocations'
import { useWeatherSettings } from '../../hooks/useWeatherSettings'
import { IPC, type IpcMutationResult, type WeatherSearchResult, type WeatherStatus } from '../../../../shared/ipc-types'

function formatLocationLabel(location: { name: string; admin1: string | null; country: string | null }): string {
  return [location.name, location.admin1, location.country].filter(Boolean).join(', ')
}

export function WeatherSettingsTab(): React.ReactElement {
  const { locations, loading: locationsLoading, search, saveLocation, removeLocation } = useWeatherLocations()
  const { settings, loading: settingsLoading, saveSettings } = useWeatherSettings()
  const [status, setStatus] = useState<WeatherStatus | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WeatherSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [intervalValue, setIntervalValue] = useState('30')
  const [rainValue, setRainValue] = useState('10')
  const [snowValue, setSnowValue] = useState('5')
  const [windValue, setWindValue] = useState('45')
  const [freezeValue, setFreezeValue] = useState('0')
  const [heatValue, setHeatValue] = useState('32')

  const reloadStatus = (): void => {
    window.api
      .invoke(IPC.WEATHER_GET_STATUS)
      .then((data) => setStatus(data as WeatherStatus))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load weather sync status.')
      })
  }

  useEffect(() => {
    reloadStatus()
  }, [])

  useEffect(() => {
    setIntervalValue(String(settings.pollIntervalMinutes))
    setRainValue(String(settings.thresholds.rainMm))
    setSnowValue(String(settings.thresholds.snowCm))
    setWindValue(String(settings.thresholds.windKph))
    setFreezeValue(String(settings.thresholds.freezeTempC))
    setHeatValue(String(settings.thresholds.heatTempC))
  }, [settings])

  const persist = async (overrides?: Partial<typeof settings>): Promise<void> => {
    setSaving(true)
    const saved = await saveSettings({
      ...settings,
      ...overrides,
      pollIntervalMinutes: Number.parseInt(intervalValue, 10) || settings.pollIntervalMinutes,
      thresholds: {
        ...settings.thresholds,
        rainMm: Number.parseFloat(rainValue) || settings.thresholds.rainMm,
        snowCm: Number.parseFloat(snowValue) || settings.thresholds.snowCm,
        windKph: Number.parseFloat(windValue) || settings.thresholds.windKph,
        freezeTempC: Number.parseFloat(freezeValue) || settings.thresholds.freezeTempC,
        heatTempC: Number.parseFloat(heatValue) || settings.thresholds.heatTempC
      }
    })
    setSaving(false)
    if (saved) {
      toast.success('Weather settings saved.')
      reloadStatus()
    }
  }

  const runSearch = async (): Promise<void> => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return
    setSearching(true)
    const results = await search(trimmed)
    setSearchResults(results)
    setSearching(false)
  }

  const addLocation = async (result: WeatherSearchResult): Promise<void> => {
    const saved = await saveLocation(result)
    if (!saved) return
    toast.success(`Added ${formatLocationLabel(saved)}.`)
    reloadStatus()
  }

  const refreshNow = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const result = (await window.api.invoke(IPC.WEATHER_REFRESH)) as IpcMutationResult & {
        refreshedCount: number
      }
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to refresh weather data.')
      } else {
        toast.success(`Refreshed ${result.refreshedCount} weather location${result.refreshedCount === 1 ? '' : 's'}.`)
        reloadStatus()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh weather data.')
    } finally {
      setRefreshing(false)
    }
  }

  const lastUpdatedLabel = status?.lastFetchedAt
    ? new Date(status.lastFetchedAt * 1000).toLocaleString()
    : 'Never'

  if (settingsLoading && locationsLoading) {
    return <p className="text-sm text-muted-foreground">Loading weather settings...</p>
  }

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div>
        <h3 className="text-sm font-medium mb-1">Weather Sync</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Shared weather refresh behavior for all Weather widgets.
        </p>
        <div className="grid gap-3 md:grid-cols-2 max-w-2xl">
          <div className="rounded-md border px-3 py-3">
            <p className="text-sm font-medium">Update frequency</p>
            <div className="mt-3 flex items-center gap-2">
              <Input value={intervalValue} onChange={(event) => setIntervalValue(event.target.value)} inputMode="numeric" className="w-28" />
              <Button variant="outline" size="sm" onClick={() => void persist()} disabled={saving}>
                {saving ? 'Saving...' : 'Save Interval'}
              </Button>
            </div>
          </div>

          <div className="rounded-md border px-3 py-3 space-y-2">
            <p className="text-sm font-medium">Status</p>
            <p className="text-xs text-muted-foreground">Saved locations: {status?.locationCount ?? locations.length}</p>
            <p className="text-xs text-muted-foreground">Last updated: {lastUpdatedLabel}</p>
            <p className="text-xs text-muted-foreground">Stale locations: {status?.staleLocationCount ?? 0}</p>
            <Button variant="outline" size="sm" onClick={() => void refreshNow()} disabled={refreshing}>
              <RefreshCcw className="h-4 w-4 mr-1" />
              {refreshing ? 'Refreshing...' : 'Refresh Now'}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Saved Locations</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Locations are shared across all Weather widgets. Each widget can use the default location or override it.
        </p>
        <div className="rounded-md border px-3 py-3 max-w-2xl">
          <div className="flex gap-2">
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search city or region" />
            <Button variant="outline" size="sm" onClick={() => void runSearch()} disabled={searching}>
              <Plus className="h-4 w-4 mr-1" />
              {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {searchResults.map((result) => (
                <div key={result.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{formatLocationLabel(result)}</p>
                    <p className="text-xs text-muted-foreground truncate">{result.latitude.toFixed(2)}, {result.longitude.toFixed(2)} • {result.timezone}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void addLocation(result)}>
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-2">
            {locations.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No saved locations yet.
              </div>
            ) : (
              locations.map((location) => {
                const isDefault = settings.defaultLocationId === location.id
                return (
                  <div key={location.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{formatLocationLabel(location)}</span>
                        {isDefault && <span className="text-xs text-sky-600">Default</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{location.timezone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isDefault && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void persist({ defaultLocationId: location.id })}
                        >
                          Set Default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const removed = await removeLocation(location.id)
                          if (!removed) return
                          if (settings.defaultLocationId === location.id) {
                            await persist({ defaultLocationId: null })
                          } else {
                            reloadStatus()
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Defaults</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Controls how new widgets and shared weather data are formatted.
        </p>
        <div className="grid gap-3 md:grid-cols-2 max-w-2xl">
          <div className="rounded-md border px-3 py-3">
            <label className="text-sm block mb-2">Temperature unit</label>
            <Select value={settings.temperatureUnit} onValueChange={(value) => void persist({ temperatureUnit: value as typeof settings.temperatureUnit })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celsius">Celsius</SelectItem>
                <SelectItem value="fahrenheit">Fahrenheit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border px-3 py-3">
            <label className="text-sm block mb-2">Wind speed unit</label>
            <Select value={settings.windSpeedUnit} onValueChange={(value) => void persist({ windSpeedUnit: value as typeof settings.windSpeedUnit })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="kmh">km/h</SelectItem>
                <SelectItem value="mph">mph</SelectItem>
                <SelectItem value="ms">m/s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border px-3 py-3">
            <label className="text-sm block mb-2">Precipitation unit</label>
            <Select value={settings.precipitationUnit} onValueChange={(value) => void persist({ precipitationUnit: value as typeof settings.precipitationUnit })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mm">Millimeters</SelectItem>
                <SelectItem value="inch">Inches</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border px-3 py-3">
            <label className="text-sm block mb-2">Time format</label>
            <Select value={settings.timeFormat} onValueChange={(value) => void persist({ timeFormat: value as typeof settings.timeFormat })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System default</SelectItem>
                <SelectItem value="12h">12-hour</SelectItem>
                <SelectItem value="24h">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-1">Alerts</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Threshold-based alerts are used as a fallback when official weather alerts are unavailable.
        </p>
        <div className="space-y-3 max-w-2xl">
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm">Show alerts in weather widgets</p>
              <p className="text-xs text-muted-foreground">Controls inline alert chips and messages inside the Weather widget.</p>
            </div>
            <Switch
              checked={settings.showAlertsInWidgets}
              onCheckedChange={(checked) => void persist({ showAlertsInWidgets: checked })}
              aria-label="Show alerts in weather widgets"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border px-3 py-3">
              <label className="text-sm block mb-2">Daily rain threshold</label>
              <div className="flex gap-2 items-center">
                <Input value={rainValue} onChange={(event) => setRainValue(event.target.value)} inputMode="decimal" className="w-28" />
                <span className="text-xs text-muted-foreground">mm/day</span>
              </div>
            </div>
            <div className="rounded-md border px-3 py-3">
              <label className="text-sm block mb-2">Daily snow threshold</label>
              <div className="flex gap-2 items-center">
                <Input value={snowValue} onChange={(event) => setSnowValue(event.target.value)} inputMode="decimal" className="w-28" />
                <span className="text-xs text-muted-foreground">cm/day</span>
              </div>
            </div>
            <div className="rounded-md border px-3 py-3">
              <label className="text-sm block mb-2">Wind gust threshold</label>
              <div className="flex gap-2 items-center">
                <Input value={windValue} onChange={(event) => setWindValue(event.target.value)} inputMode="decimal" className="w-28" />
                <span className="text-xs text-muted-foreground">km/h</span>
              </div>
            </div>
            <div className="rounded-md border px-3 py-3">
              <label className="text-sm block mb-2">Freeze threshold</label>
              <div className="flex gap-2 items-center">
                <Input value={freezeValue} onChange={(event) => setFreezeValue(event.target.value)} inputMode="decimal" className="w-28" />
                <span className="text-xs text-muted-foreground">°C</span>
              </div>
            </div>
            <div className="rounded-md border px-3 py-3">
              <label className="text-sm block mb-2">Heat threshold</label>
              <div className="flex gap-2 items-center">
                <Input value={heatValue} onChange={(event) => setHeatValue(event.target.value)} inputMode="decimal" className="w-28" />
                <span className="text-xs text-muted-foreground">°C</span>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => void persist()} disabled={saving}>
            <CloudSun className="h-4 w-4 mr-1" />
            {saving ? 'Saving...' : 'Save Alert Thresholds'}
          </Button>
        </div>
      </div>
    </div>
  )
}