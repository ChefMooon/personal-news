import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Sun,
  X
} from 'lucide-react'
import { useWidgetInstance } from '../../contexts/WidgetInstanceContext'
import { useWeatherConfig, DEFAULT_WEATHER_VIEW_CONFIG } from '../../hooks/useWeatherConfig'
import { useWeatherLocations } from '../../hooks/useWeatherLocations'
import { useWeatherSettings } from '../../hooks/useWeatherSettings'
import { useWeatherSnapshot } from '../../hooks/useWeatherSnapshot'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Separator } from '../../components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '../../components/ui/alert-dialog'
import { cn } from '../../lib/utils'
import { WeatherSettingsPanel } from './WeatherSettingsPanel'
import { registerRendererModule } from '../registry'
import type { WeatherDailyPoint, WeatherHourlyPoint, WeatherSettings, WeatherSnapshot, WeatherViewConfig } from '../../../../shared/ipc-types'

function weatherIcon(code: number | null, isDay: boolean): React.ReactElement {
  if (code == null) return <Cloud className="h-8 w-8 text-muted-foreground" />
  if (code === 0) return isDay ? <Sun className="h-8 w-8 text-amber-500" /> : <Moon className="h-8 w-8 text-sky-400" />
  if (code === 1 || code === 2) return isDay ? <CloudSun className="h-8 w-8 text-amber-500" /> : <CloudMoon className="h-8 w-8 text-sky-400" />
  if (code === 3) return <Cloud className="h-8 w-8 text-slate-500" />
  if (code === 45 || code === 48) return <CloudFog className="h-8 w-8 text-slate-500" />
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return code <= 55 ? <CloudDrizzle className="h-8 w-8 text-sky-500" /> : <CloudRain className="h-8 w-8 text-sky-600" />
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className="h-8 w-8 text-sky-500" />
  if (code >= 95) return <CloudLightning className="h-8 w-8 text-violet-500" />
  return <Cloud className="h-8 w-8 text-muted-foreground" />
}

function formatLocationName(snapshot: WeatherSnapshot | null): string {
  if (!snapshot) return 'Location needed'
  return [snapshot.location.name, snapshot.location.admin1, snapshot.location.country].filter(Boolean).join(', ')
}

function tempUnit(settings: WeatherSettings): string {
  return settings.temperatureUnit === 'fahrenheit' ? 'F' : 'C'
}

function windUnit(settings: WeatherSettings): string {
  if (settings.windSpeedUnit === 'mph') return 'mph'
  if (settings.windSpeedUnit === 'ms') return 'm/s'
  return 'km/h'
}

function precipUnit(settings: WeatherSettings): string {
  return settings.precipitationUnit === 'inch' ? 'in' : 'mm'
}

function formatTemp(value: number | null, settings: WeatherSettings): string {
  return value == null ? '—' : `${Math.round(value)}°${tempUnit(settings)}`
}

function formatNumber(value: number | null, suffix: string): string {
  return value == null ? '—' : `${Math.round(value)} ${suffix}`
}

function formatTime(value: number | null, settings: WeatherSettings): string {
  if (value == null) return '—'
  const hour12 = settings.timeFormat === 'system' ? undefined : settings.timeFormat === '12h'
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12
  })
}

function formatHourLabel(value: number, settings: WeatherSettings): string {
  const hour12 = settings.timeFormat === 'system' ? undefined : settings.timeFormat === '12h'
  return new Date(value * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    hour12
  })
}

function hourlyCount(config: WeatherViewConfig): number {
  if (config.detailLevel === 'summary') return 4
  if (config.detailLevel === 'detailed') return 8
  return 6
}

function dailyCount(config: WeatherViewConfig): number {
  if (config.detailLevel === 'summary') return 3
  if (config.detailLevel === 'detailed') return 7
  return 5
}

function StatChip({ icon, label }: { icon: string; label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1 rounded-md bg-muted/30 px-2 py-1">
      <span className="text-xs">{icon}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function HourlyTimeline({
  points,
  config,
  settings
}: {
  points: WeatherHourlyPoint[]
  config: WeatherViewConfig
  settings: WeatherSettings
}): React.ReactElement {
  const visible = points.slice(0, hourlyCount(config))

  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No hourly forecast available.</p>
  }

  const temps = visible.map((point) => point.temperature ?? 0)
  const minTemp = Math.min(...temps)
  const maxTemp = Math.max(...temps)
  const tempRange = maxTemp - minTemp || 1

  return (
    <>
      <div className="weather-timeline-scroll flex gap-1.5 overflow-x-auto">
        {visible.map((point, index) => {
          const temp = point.temperature ?? 0
          const rain = point.precipitationProbability ?? 0
          const dotBottomPct = ((temp - minTemp) / tempRange) * 55 + 8

          return (
            <div key={point.time} className="flex min-w-[40px] flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-semibold leading-none">
                {formatTemp(point.temperature, settings)}
              </span>

              <div className="relative h-14 w-full overflow-hidden rounded-md bg-muted/10">
                {config.showPrecipitation && (
                  <div
                    className="absolute right-0 bottom-0 left-0 rounded-md transition-all"
                    style={{
                      height: `${rain}%`,
                      backgroundColor: rain > 40 ? 'hsl(199 89% 48% / 0.35)' : 'hsl(199 89% 48% / 0.16)'
                    }}
                  />
                )}
                <div
                  className="absolute left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full"
                  style={{
                    bottom: `${dotBottomPct}%`,
                    backgroundColor: index === 0 ? 'hsl(199 89% 68%)' : 'hsl(215 16% 47% / 0.8)',
                    boxShadow: index === 0 ? '0 0 5px hsl(199 89% 68% / 0.8)' : 'none'
                  }}
                />
              </div>

              {config.showPrecipitation && config.detailLevel !== 'summary' && (
                <span className="text-[9px] leading-none text-sky-500">{rain}%</span>
              )}

              <div className="[&_svg]:h-3.5 [&_svg]:w-3.5">{weatherIcon(point.weatherCode, true)}</div>

              <span className="text-[9.5px] leading-none text-muted-foreground">
                {formatHourLabel(point.time, settings)}
              </span>
            </div>
          )
        })}
      </div>

      {config.detailLevel === 'detailed' && config.showWind && (
        <div className="weather-timeline-scroll mt-1 flex gap-1.5 overflow-x-auto">
          {visible.map((point) => (
            <div key={point.time} className="min-w-[40px] flex-1 text-center">
              <span className="text-[9px] text-muted-foreground">
                {formatNumber(point.windSpeed, windUnit(settings))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function DailyForecast({
  points,
  config,
  settings
}: {
  points: WeatherDailyPoint[]
  config: WeatherViewConfig
  settings: WeatherSettings
}): React.ReactElement {
  const visible = points.slice(0, dailyCount(config))

  if (visible.length === 0) {
    return <p className="text-xs text-muted-foreground">No daily forecast available.</p>
  }

  const allLo = visible.map((point) => point.tempMin ?? 0)
  const allHi = visible.map((point) => point.tempMax ?? 0)
  const globalMin = Math.min(...allLo)
  const globalMax = Math.max(...allHi)
  const globalRange = globalMax - globalMin || 1

  return (
    <div className="space-y-1.5">
      {visible.map((point, index) => {
        const lo = point.tempMin ?? globalMin
        const hi = point.tempMax ?? globalMax
        const rain = point.precipitationProbabilityMax ?? 0
        const loPos = ((lo - globalMin) / globalRange) * 100
        const hiPos = ((hi - globalMin) / globalRange) * 100
        const isWarm = hi > 5

        return (
          <div key={point.date} className="flex items-center gap-2">
            <span
              className={cn(
                'w-8 shrink-0 text-[10px]',
                index === 0 ? 'font-bold text-sky-400' : 'text-muted-foreground'
              )}
            >
              {index === 0
                ? 'Today'
                : new Date(`${point.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}
            </span>

            <div className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{weatherIcon(point.weatherCode, true)}</div>

            {config.detailLevel !== 'summary' && config.showPrecipitation && (
              <span className="w-7 shrink-0 text-right text-[9.5px] text-sky-500">{rain}%</span>
            )}

            <div className="relative h-[5px] flex-1 rounded-full bg-muted/20">
              <div
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: `${loPos}%`,
                  width: `${Math.max(hiPos - loPos, 2)}%`,
                  background: isWarm
                    ? 'linear-gradient(90deg, hsl(217 91% 70%), hsl(38 92% 60%))'
                    : 'linear-gradient(90deg, hsl(217 91% 60%), hsl(199 89% 70%))'
                }}
              />
            </div>

            {config.detailLevel !== 'summary' && (
              <span className="w-7 shrink-0 text-right text-[10px] text-muted-foreground">
                {formatTemp(point.tempMin, settings)}
              </span>
            )}

            <span className="w-7 shrink-0 text-right text-[11px] font-semibold">
              {formatTemp(point.tempMax, settings)}
            </span>

            {config.detailLevel === 'detailed' && config.showWind && (
              <span className="w-12 shrink-0 text-right text-[9px] text-muted-foreground">
                {formatNumber(point.windSpeedMax, windUnit(settings))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeatherWidget(): React.ReactElement {
  const { instanceId, label } = useWidgetInstance()
  const widgetTitle = label ?? 'Weather'
  const { config, setConfig } = useWeatherConfig(instanceId)
  const { locations, search, saveLocation } = useWeatherLocations()
  const { settings } = useWeatherSettings()
  const effectiveLocationId = config.locationId ?? settings.defaultLocationId
  const { snapshot, loading } = useWeatherSnapshot(effectiveLocationId)
  const [isEditing, setIsEditing] = useState(false)
  const [snapshotConfig, setSnapshotConfig] = useState<WeatherViewConfig | null>(null)
  const [editContentHeight, setEditContentHeight] = useState<number | null>(null)
  const [alertDismissed, setAlertDismissed] = useState(false)
  const cardContentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setAlertDismissed(false)
  }, [snapshot?.fetchedAt])

  useEffect(() => {
    if (!isEditing) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  const visibleAlerts = useMemo(() => {
    if (!snapshot) return []
    if (!config.showAlerts || !settings.showAlertsInWidgets) return []
    return snapshot.alerts
  }, [config.showAlerts, settings.showAlertsInWidgets, snapshot])

  function handleOpenEdit(): void {
    const currentHeight = cardContentRef.current?.getBoundingClientRect().height
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight)
    }
    setSnapshotConfig(config)
    setIsEditing(true)
  }

  function handleClose(): void {
    setIsEditing(false)
    setSnapshotConfig(null)
    setEditContentHeight(null)
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig)
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_WEATHER_VIEW_CONFIG)
    setSnapshotConfig(DEFAULT_WEATHER_VIEW_CONFIG)
  }

  const preview = (
    <div className="space-y-4">
      {!effectiveLocationId ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          Choose a location in widget settings, or set a default location in Settings → Weather.
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading weather...</p>
      ) : !snapshot?.current ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No weather data cached yet. Use Settings → Weather to refresh now, or wait for the next scheduled update.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 [&_svg]:h-7 [&_svg]:w-7">
                {weatherIcon(snapshot.current.weatherCode, snapshot.current.isDay)}
              </div>
              <div>
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="text-3xl font-light">{formatTemp(snapshot.current.temperature, settings)}</span>
                  {config.showFeelsLike && (
                    <span className="text-xs text-muted-foreground">
                      feels {formatTemp(snapshot.current.apparentTemperature, settings)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatLocationName(snapshot)}</p>
              </div>
            </div>
            <div className="shrink-0 space-y-1 text-right text-xs text-muted-foreground">
              {snapshot.fetchedAt && <p>Updated {formatTime(snapshot.fetchedAt, settings)}</p>}
              {snapshot.stale && <Badge variant="secondary">Stale</Badge>}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {config.showPrecipitation && (
              <StatChip label={formatNumber(snapshot.current.precipitation, precipUnit(settings))} icon="💧" />
            )}
            {config.showWind && (
              <StatChip label={formatNumber(snapshot.current.windSpeed, windUnit(settings))} icon="💨" />
            )}
            {config.showWind && config.detailLevel !== 'summary' && (
              <StatChip label={`${formatNumber(snapshot.current.windGusts, windUnit(settings))} gusts`} icon="🌬️" />
            )}
            {config.showHumidity && (
              <StatChip label={formatNumber(snapshot.current.relativeHumidity, '%')} icon="💦" />
            )}
          </div>

          {visibleAlerts.length > 0 && !alertDismissed && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-amber-600 dark:text-amber-400">
                    {visibleAlerts.map((alert) => alert.title).join(' · ')}
                  </p>
                  {config.detailLevel === 'detailed' && (
                    <div className="mt-0.5 space-y-0.5">
                      {visibleAlerts.map((alert) => (
                        <p key={`${alert.id}:msg`} className="text-[10px] text-muted-foreground">
                          {alert.message}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Dismiss alert"
                onClick={() => setAlertDismissed(true)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {(config.displayMode === 'current_hourly' || config.displayMode === 'current_daily') && <Separator />}

          {config.showSunTimes && snapshot.daily[0] && (
            <div className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs text-muted-foreground">
              <span>Sunrise {formatTime(snapshot.daily[0].sunrise, settings)}</span>
              <span>Sunset {formatTime(snapshot.daily[0].sunset, settings)}</span>
            </div>
          )}

          {config.displayMode === 'current_hourly' && (
            <HourlyTimeline points={snapshot.hourly} config={config} settings={settings} />
          )}
          {config.displayMode === 'current_daily' && (
            <DailyForecast points={snapshot.daily} config={config} settings={settings} />
          )}
        </>
      )}
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-sky-500" />
            {widgetTitle}
          </CardTitle>
          {isEditing ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={handleReset}
                title="Reset to when you opened this"
                aria-label="Reset settings"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Restore defaults"
                    aria-label="Restore default settings"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                    <AlertDialogDescription>
                      Reset all Weather widget settings to their defaults? This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFactoryReset}>Confirm</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={handleClose}
                title="Close settings"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Weather widget settings"
              onClick={handleOpenEdit}
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        style={isEditing && editContentHeight ? { height: editContentHeight, overflow: 'hidden' } : undefined}
      >
        <div className={isEditing ? 'weather-card-edit' : undefined}>
          <div className={isEditing ? 'weather-card-edit__preview' : undefined}>{preview}</div>
          {isEditing && (
            <div className="weather-card-edit__panel">
              <WeatherSettingsPanel
                config={config}
                onChange={setConfig}
                locations={locations}
                defaultLocationId={settings.defaultLocationId}
                settings={settings}
                onSearch={search}
                onSaveLocation={saveLocation}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

registerRendererModule({
  id: 'weather',
  displayName: 'Weather',
  widget: WeatherWidget
})

export default WeatherWidget