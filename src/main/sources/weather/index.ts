import { BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { IPC } from '../../../shared/ipc-types'
import type {
  IpcMutationResult,
  WeatherAlert,
  WeatherCurrentConditions,
  WeatherDailyPoint,
  WeatherHourlyPoint,
  WeatherLocation,
  WeatherSearchResult,
  WeatherSettings,
  WeatherSnapshot,
  WeatherStatus
} from '../../../shared/ipc-types'
import { getSetting, setSetting } from '../../settings/store'
import { notifyWeatherAlerts } from '../../notifications/notification-service'
import type { DataSourceModule } from '../registry'

const WEATHER_SETTINGS_KEY = 'weather_settings_json'
const WEATHER_ENABLED_KEY = 'weather_enabled'
const WEATHER_STALE_SECONDS = 60 * 60 * 3

const DEFAULT_WEATHER_SETTINGS: WeatherSettings = {
  pollIntervalMinutes: 30,
  defaultLocationId: null,
  temperatureUnit: 'celsius',
  windSpeedUnit: 'kmh',
  precipitationUnit: 'mm',
  timeFormat: 'system',
  showAlertsInWidgets: true,
  thresholds: {
    rainMm: 10,
    snowCm: 5,
    windKph: 45,
    freezeTempC: 0,
    heatTempC: 32
  }
}

let dbRef: Database.Database | null = null
let pollTimer: NodeJS.Timeout | null = null
let refreshPromise: Promise<number> | null = null

function emitWeatherUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.WEATHER_UPDATED)
  }
}

function isWeatherEnabled(): boolean {
  return getSetting(WEATHER_ENABLED_KEY) !== 'false'
}

function getSettings(): WeatherSettings {
  const raw = getSetting(WEATHER_SETTINGS_KEY)
  if (!raw) {
    return { ...DEFAULT_WEATHER_SETTINGS }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WeatherSettings>
    return {
      ...DEFAULT_WEATHER_SETTINGS,
      ...parsed,
      thresholds: {
        ...DEFAULT_WEATHER_SETTINGS.thresholds,
        ...parsed.thresholds
      }
    }
  } catch {
    return { ...DEFAULT_WEATHER_SETTINGS }
  }
}

function setSettings(next: WeatherSettings): void {
  setSetting(WEATHER_SETTINGS_KEY, JSON.stringify(next))
}

function ensureDb(): Database.Database {
  if (!dbRef) {
    throw new Error('Weather module not initialized.')
  }

  return dbRef
}

function toUnixSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const millis = Date.parse(value)
  return Number.isNaN(millis) ? null : Math.floor(millis / 1000)
}

function normalizeLocationId(result: WeatherSearchResult): string {
  return result.id || `${result.latitude.toFixed(4)},${result.longitude.toFixed(4)}:${result.timezone}`
}

function mapLocationRow(row: {
  id: string
  name: string
  admin1: string | null
  country: string | null
  country_code: string | null
  latitude: number
  longitude: number
  timezone: string
  created_at: number
  last_fetched_at: number | null
}): WeatherLocation {
  return {
    id: row.id,
    name: row.name,
    admin1: row.admin1,
    country: row.country,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    createdAt: row.created_at,
    lastFetchedAt: row.last_fetched_at
  }
}

function listLocations(): WeatherLocation[] {
  const db = ensureDb()
  const rows = db
    .prepare(
      `SELECT wl.id, wl.name, wl.admin1, wl.country, wl.country_code, wl.latitude, wl.longitude,
              wl.timezone, wl.created_at, wc.fetched_at AS last_fetched_at
         FROM weather_locations wl
         LEFT JOIN weather_cache wc ON wc.location_id = wl.id
        ORDER BY wl.created_at ASC`
    )
    .all() as Array<{
      id: string
      name: string
      admin1: string | null
      country: string | null
      country_code: string | null
      latitude: number
      longitude: number
      timezone: string
      created_at: number
      last_fetched_at: number | null
    }>

  return rows.map(mapLocationRow)
}

async function fetchGeocodingResults(query: string): Promise<WeatherSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  const params = new URLSearchParams({
    name: trimmed,
    count: '8',
    language: 'en',
    format: 'json'
  })

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Weather location search failed with HTTP ${response.status}.`)
  }

  const payload = (await response.json()) as {
    results?: Array<{
      id?: number
      name?: string
      admin1?: string
      country?: string
      country_code?: string
      latitude?: number
      longitude?: number
      timezone?: string
    }>
  }

  return (payload.results ?? [])
    .filter((entry) => {
      return (
        typeof entry.name === 'string' &&
        typeof entry.latitude === 'number' &&
        typeof entry.longitude === 'number' &&
        typeof entry.timezone === 'string'
      )
    })
    .map((entry) => ({
      id: String(entry.id ?? `${entry.latitude},${entry.longitude}:${entry.timezone}`),
      name: entry.name!,
      admin1: entry.admin1 ?? null,
      country: entry.country ?? null,
      countryCode: entry.country_code ?? null,
      latitude: entry.latitude!,
      longitude: entry.longitude!,
      timezone: entry.timezone!
    }))
}

function saveLocation(location: WeatherSearchResult): WeatherLocation {
  const db = ensureDb()
  const id = normalizeLocationId(location)
  const createdAt = Math.floor(Date.now() / 1000)

  db.prepare(
    `INSERT INTO weather_locations (id, name, admin1, country, country_code, latitude, longitude, timezone, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       admin1 = excluded.admin1,
       country = excluded.country,
       country_code = excluded.country_code,
       latitude = excluded.latitude,
       longitude = excluded.longitude,
       timezone = excluded.timezone`
  ).run(
    id,
    location.name,
    location.admin1,
    location.country,
    location.countryCode,
    location.latitude,
    location.longitude,
    location.timezone,
    createdAt
  )

  const settings = getSettings()
  if (!settings.defaultLocationId) {
    setSettings({ ...settings, defaultLocationId: id })
  }

  const saved = listLocations().find((item) => item.id === id)
  if (!saved) {
    throw new Error('Failed to save weather location.')
  }

  return saved
}

function removeLocation(locationId: string): IpcMutationResult {
  const db = ensureDb()
  const result = db.prepare('DELETE FROM weather_locations WHERE id = ?').run(locationId)
  if (result.changes === 0) {
    return { ok: false, error: 'Weather location not found.' }
  }

  const settings = getSettings()
  if (settings.defaultLocationId === locationId) {
    setSettings({ ...settings, defaultLocationId: null })
  }

  emitWeatherUpdated()
  schedulePolling()

  return { ok: true, error: null }
}

function getSnapshot(locationId: string): WeatherSnapshot | null {
  const db = ensureDb()
  const row = db
    .prepare(
      `SELECT wl.id, wl.name, wl.admin1, wl.country, wl.country_code, wl.latitude, wl.longitude,
              wl.timezone, wl.created_at, wc.current_json, wc.hourly_json, wc.daily_json,
              wc.alerts_json, wc.fetched_at
         FROM weather_locations wl
         LEFT JOIN weather_cache wc ON wc.location_id = wl.id
        WHERE wl.id = ?`
    )
    .get(locationId) as
    | {
        id: string
        name: string
        admin1: string | null
        country: string | null
        country_code: string | null
        latitude: number
        longitude: number
        timezone: string
        created_at: number
        current_json: string | null
        hourly_json: string | null
        daily_json: string | null
        alerts_json: string | null
        fetched_at: number | null
      }
    | undefined

  if (!row) {
    return null
  }

  const location = mapLocationRow({
    id: row.id,
    name: row.name,
    admin1: row.admin1,
    country: row.country,
    country_code: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    created_at: row.created_at,
    last_fetched_at: row.fetched_at
  })

  const now = Math.floor(Date.now() / 1000)
  return {
    location,
    fetchedAt: row.fetched_at,
    stale: row.fetched_at == null ? true : now - row.fetched_at > WEATHER_STALE_SECONDS,
    current: row.current_json ? (JSON.parse(row.current_json) as WeatherCurrentConditions) : null,
    hourly: row.hourly_json ? (JSON.parse(row.hourly_json) as WeatherHourlyPoint[]) : [],
    daily: row.daily_json ? (JSON.parse(row.daily_json) as WeatherDailyPoint[]) : [],
    alerts: row.alerts_json ? (JSON.parse(row.alerts_json) as WeatherAlert[]) : []
  }
}

function buildAlertHash(alerts: WeatherAlert[]): string {
  return JSON.stringify(alerts.map((alert) => `${alert.kind}:${alert.title}:${alert.message}`))
}

function classifySeverity(actual: number, threshold: number): 'warning' | 'error' {
  if (threshold === 0) {
    return actual < threshold - 3 ? 'error' : 'warning'
  }

  return actual >= threshold * 1.5 ? 'error' : 'warning'
}

function evaluateAlerts(
  location: WeatherLocation,
  current: WeatherCurrentConditions,
  daily: WeatherDailyPoint[],
  settings: WeatherSettings
): WeatherAlert[] {
  const alerts: WeatherAlert[] = []
  const today = daily[0]

  if (today?.precipitationSum != null && today.precipitationSum >= settings.thresholds.rainMm) {
    alerts.push({
      id: `${location.id}:rain:${today.date}`,
      kind: 'rain',
      severity: classifySeverity(today.precipitationSum, settings.thresholds.rainMm),
      title: 'Heavy rain expected',
      message: `${location.name} may see about ${today.precipitationSum.toFixed(0)} mm of rain today.`
    })
  }

  if (today?.snowfallSum != null && today.snowfallSum >= settings.thresholds.snowCm) {
    alerts.push({
      id: `${location.id}:snow:${today.date}`,
      kind: 'snow',
      severity: classifySeverity(today.snowfallSum, settings.thresholds.snowCm),
      title: 'Snow expected',
      message: `${location.name} may see about ${today.snowfallSum.toFixed(0)} cm of snow today.`
    })
  }

  if (current.windGusts != null && current.windGusts >= settings.thresholds.windKph) {
    alerts.push({
      id: `${location.id}:wind:${current.time}`,
      kind: 'wind',
      severity: classifySeverity(current.windGusts, settings.thresholds.windKph),
      title: 'Strong wind conditions',
      message: `${location.name} currently has gusts around ${current.windGusts.toFixed(0)} km/h.`
    })
  }

  if (current.temperature != null && current.temperature <= settings.thresholds.freezeTempC) {
    alerts.push({
      id: `${location.id}:freeze:${current.time}`,
      kind: 'freeze',
      severity: current.temperature <= settings.thresholds.freezeTempC - 5 ? 'error' : 'warning',
      title: 'Freezing temperatures',
      message: `${location.name} is at ${current.temperature.toFixed(0)}°C.`
    })
  }

  if (current.temperature != null && current.temperature >= settings.thresholds.heatTempC) {
    alerts.push({
      id: `${location.id}:heat:${current.time}`,
      kind: 'heat',
      severity: current.temperature >= settings.thresholds.heatTempC + 5 ? 'error' : 'warning',
      title: 'High heat conditions',
      message: `${location.name} is at ${current.temperature.toFixed(0)}°C.`
    })
  }

  return alerts
}

async function fetchForecast(location: WeatherLocation, settings: WeatherSettings): Promise<{
  current: WeatherCurrentConditions
  hourly: WeatherHourlyPoint[]
  daily: WeatherDailyPoint[]
  alerts: WeatherAlert[]
}> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day,wind_speed_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,sunrise,sunset',
    forecast_days: '7',
    temperature_unit: settings.temperatureUnit,
    wind_speed_unit: settings.windSpeedUnit,
    precipitation_unit: settings.precipitationUnit
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`Weather forecast request failed with HTTP ${response.status}.`)
  }

  const payload = (await response.json()) as {
    current?: Record<string, unknown>
    hourly?: Record<string, unknown>
    daily?: Record<string, unknown>
  }

  const current: WeatherCurrentConditions = {
    time: toUnixSeconds(String(payload.current?.time ?? '')) ?? Math.floor(Date.now() / 1000),
    temperature: typeof payload.current?.temperature_2m === 'number' ? payload.current.temperature_2m : null,
    apparentTemperature:
      typeof payload.current?.apparent_temperature === 'number'
        ? payload.current.apparent_temperature
        : null,
    relativeHumidity:
      typeof payload.current?.relative_humidity_2m === 'number'
        ? payload.current.relative_humidity_2m
        : null,
    precipitation:
      typeof payload.current?.precipitation === 'number' ? payload.current.precipitation : null,
    weatherCode: typeof payload.current?.weather_code === 'number' ? payload.current.weather_code : null,
    isDay: payload.current?.is_day === 1,
    windSpeed: typeof payload.current?.wind_speed_10m === 'number' ? payload.current.wind_speed_10m : null,
    windGusts: typeof payload.current?.wind_gusts_10m === 'number' ? payload.current.wind_gusts_10m : null
  }

  const hourlyTimes = Array.isArray(payload.hourly?.time) ? payload.hourly.time : []
  const mappedHourly = hourlyTimes.map((time, index) => ({
    time: toUnixSeconds(String(time)) ?? Math.floor(Date.now() / 1000),
    temperature: Array.isArray(payload.hourly?.temperature_2m)
      ? Number(payload.hourly.temperature_2m[index] ?? null)
      : null,
    precipitationProbability: Array.isArray(payload.hourly?.precipitation_probability)
      ? Number(payload.hourly.precipitation_probability[index] ?? null)
      : null,
    weatherCode: Array.isArray(payload.hourly?.weather_code)
      ? Number(payload.hourly.weather_code[index] ?? null)
      : null,
    windSpeed: Array.isArray(payload.hourly?.wind_speed_10m)
      ? Number(payload.hourly.wind_speed_10m[index] ?? null)
      : null,
    relativeHumidity: Array.isArray(payload.hourly?.relative_humidity_2m)
      ? Number(payload.hourly.relative_humidity_2m[index] ?? null)
      : null
  }))
  const firstUpcomingHourlyIndex = mappedHourly.findIndex((point) => point.time >= current.time)
  const hourlyStartIndex = firstUpcomingHourlyIndex >= 0 ? firstUpcomingHourlyIndex : 0
  const hourly = mappedHourly.slice(hourlyStartIndex, hourlyStartIndex + 12)

  const dailyTimes = Array.isArray(payload.daily?.time) ? payload.daily.time : []
  const daily = dailyTimes.slice(0, 7).map((date, index) => ({
    date: String(date),
    weatherCode: Array.isArray(payload.daily?.weather_code)
      ? Number(payload.daily.weather_code[index] ?? null)
      : null,
    tempMin: Array.isArray(payload.daily?.temperature_2m_min)
      ? Number(payload.daily.temperature_2m_min[index] ?? null)
      : null,
    tempMax: Array.isArray(payload.daily?.temperature_2m_max)
      ? Number(payload.daily.temperature_2m_max[index] ?? null)
      : null,
    precipitationSum: Array.isArray(payload.daily?.precipitation_sum)
      ? Number(payload.daily.precipitation_sum[index] ?? null)
      : null,
    snowfallSum: Array.isArray(payload.daily?.snowfall_sum)
      ? Number(payload.daily.snowfall_sum[index] ?? null)
      : null,
    precipitationProbabilityMax: Array.isArray(payload.daily?.precipitation_probability_max)
      ? Number(payload.daily.precipitation_probability_max[index] ?? null)
      : null,
    windSpeedMax: Array.isArray(payload.daily?.wind_speed_10m_max)
      ? Number(payload.daily.wind_speed_10m_max[index] ?? null)
      : null,
    sunrise: Array.isArray(payload.daily?.sunrise)
      ? toUnixSeconds(String(payload.daily.sunrise[index] ?? ''))
      : null,
    sunset: Array.isArray(payload.daily?.sunset)
      ? toUnixSeconds(String(payload.daily.sunset[index] ?? ''))
      : null
  }))

  return {
    current,
    hourly,
    daily,
    alerts: evaluateAlerts(location, current, daily, settings)
  }
}

async function refreshLocation(location: WeatherLocation, settings: WeatherSettings): Promise<void> {
  const db = ensureDb()
  const result = await fetchForecast(location, settings)
  const fetchedAt = Math.floor(Date.now() / 1000)

  db.prepare(
    `INSERT INTO weather_cache (location_id, current_json, hourly_json, daily_json, alerts_json, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(location_id) DO UPDATE SET
       current_json = excluded.current_json,
       hourly_json = excluded.hourly_json,
       daily_json = excluded.daily_json,
       alerts_json = excluded.alerts_json,
       fetched_at = excluded.fetched_at`
  ).run(
    location.id,
    JSON.stringify(result.current),
    JSON.stringify(result.hourly),
    JSON.stringify(result.daily),
    JSON.stringify(result.alerts),
    fetchedAt
  )

  const alertHash = buildAlertHash(result.alerts)
  const prior = db
    .prepare('SELECT alert_hash FROM weather_alert_state WHERE location_id = ?')
    .get(location.id) as { alert_hash: string | null } | undefined

  db.prepare(
    `INSERT INTO weather_alert_state (location_id, alert_hash, last_notified_at)
     VALUES (?, ?, ?)
     ON CONFLICT(location_id) DO UPDATE SET
       alert_hash = excluded.alert_hash,
       last_notified_at = CASE WHEN excluded.last_notified_at IS NULL THEN weather_alert_state.last_notified_at ELSE excluded.last_notified_at END`
  ).run(location.id, alertHash, null)

  if (result.alerts.length > 0 && alertHash !== (prior?.alert_hash ?? '')) {
    notifyWeatherAlerts(location.name, result.alerts)
    db.prepare(
      'UPDATE weather_alert_state SET last_notified_at = ? WHERE location_id = ?'
    ).run(fetchedAt, location.id)
  }
}

async function doRefresh(locationId?: string): Promise<number> {
  const settings = getSettings()
  const locations = locationId
    ? listLocations().filter((location) => location.id === locationId)
    : listLocations()

  for (const location of locations) {
    await refreshLocation(location, settings)
  }

  emitWeatherUpdated()
  return locations.length
}

function schedulePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (!isWeatherEnabled()) {
    return
  }

  const settings = getSettings()
  if (listLocations().length === 0) {
    return
  }

  pollTimer = setInterval(() => {
    void triggerWeatherRefresh().catch((error) => {
      console.error('[Weather] Scheduled refresh failed:', error)
    })
  }, Math.max(1, settings.pollIntervalMinutes) * 60 * 1000)
}

export function getWeatherSettings(): WeatherSettings {
  return getSettings()
}

export function updateWeatherSettings(next: WeatherSettings): WeatherSettings {
  const normalized: WeatherSettings = {
    ...DEFAULT_WEATHER_SETTINGS,
    ...next,
    pollIntervalMinutes: Math.max(5, Math.min(1440, Math.round(next.pollIntervalMinutes))),
    thresholds: {
      ...DEFAULT_WEATHER_SETTINGS.thresholds,
      ...next.thresholds,
      rainMm: Math.max(1, next.thresholds.rainMm),
      snowCm: Math.max(1, next.thresholds.snowCm),
      windKph: Math.max(5, next.thresholds.windKph),
      freezeTempC: next.thresholds.freezeTempC,
      heatTempC: next.thresholds.heatTempC
    }
  }

  setSettings(normalized)
  schedulePolling()
  emitWeatherUpdated()
  return normalized
}

export function applyWeatherPollSettings(): void {
  schedulePolling()
}

export function getWeatherLocations(): WeatherLocation[] {
  return listLocations()
}

export async function searchWeatherLocations(query: string): Promise<WeatherSearchResult[]> {
  return fetchGeocodingResults(query)
}

export function saveWeatherLocation(location: WeatherSearchResult): WeatherLocation {
  const saved = saveLocation(location)
  emitWeatherUpdated()
  schedulePolling()
  return saved
}

export function deleteWeatherLocation(locationId: string): IpcMutationResult {
  return removeLocation(locationId)
}

export function getWeatherSnapshot(locationId: string): WeatherSnapshot | null {
  return getSnapshot(locationId)
}

export async function triggerWeatherRefresh(locationId?: string): Promise<number> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = doRefresh(locationId).finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export function getWeatherStatus(): WeatherStatus {
  const snapshots = listLocations().map((location) => getSnapshot(location.id)).filter(Boolean) as WeatherSnapshot[]
  const lastFetchedAt = snapshots.reduce<number | null>((latest, snapshot) => {
    if (snapshot.fetchedAt == null) {
      return latest
    }

    return latest == null ? snapshot.fetchedAt : Math.max(latest, snapshot.fetchedAt)
  }, null)

  const staleLocationCount = snapshots.filter((snapshot) => snapshot.stale).length
  return {
    locationCount: snapshots.length,
    lastFetchedAt,
    staleLocationCount
  }
}

export const WeatherModule: DataSourceModule = {
  id: 'weather',
  displayName: 'Weather',
  initialize(db: Database.Database): void {
    dbRef = db
    schedulePolling()
    if (isWeatherEnabled() && listLocations().length > 0) {
      void triggerWeatherRefresh().catch((error) => {
        console.error('[Weather] Initial refresh failed:', error)
      })
    }
  },
  shutdown(): void {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    dbRef = null
  }
}