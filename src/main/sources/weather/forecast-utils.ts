import type { WeatherCurrentConditions } from '../../../shared/ipc-types'

export interface WeatherCurrentFallback {
  surfacePressure?: number | null
  visibility?: number | null
  uvIndex?: number | null
  dewPoint?: number | null
}

function toUnixSeconds(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const millis = Date.parse(value)
  return Number.isNaN(millis) ? null : Math.floor(millis / 1000)
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function currentNumber(
  current: Record<string, unknown> | undefined,
  key: string,
  fallback?: number | null
): number | null {
  return toNullableNumber(current?.[key]) ?? fallback ?? null
}

export function floorUnixSecondsToHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600
}

export function mapCurrentConditions(
  currentPayload: Record<string, unknown> | undefined,
  fallback: WeatherCurrentFallback = {},
  airQuality: number | null = null,
  currentTime = Math.floor(Date.now() / 1000)
): WeatherCurrentConditions {
  return {
    time: toUnixSeconds(String(currentPayload?.time ?? '')) ?? currentTime,
    temperature: toNullableNumber(currentPayload?.temperature_2m),
    apparentTemperature: toNullableNumber(currentPayload?.apparent_temperature),
    relativeHumidity: toNullableNumber(currentPayload?.relative_humidity_2m),
    precipitation: toNullableNumber(currentPayload?.precipitation),
    weatherCode: toNullableNumber(currentPayload?.weather_code),
    isDay: currentPayload?.is_day === 1,
    windSpeed: toNullableNumber(currentPayload?.wind_speed_10m),
    windGusts: toNullableNumber(currentPayload?.wind_gusts_10m),
    surfacePressure: currentNumber(currentPayload, 'surface_pressure', fallback.surfacePressure),
    visibility: currentNumber(currentPayload, 'visibility', fallback.visibility),
    uvIndex: currentNumber(currentPayload, 'uv_index', fallback.uvIndex),
    dewPoint: currentNumber(currentPayload, 'dew_point_2m', fallback.dewPoint),
    airQuality
  }
}

export function takeUpcomingHourly<T extends { time: number }>(points: T[], currentTime: number, count: number): T[] {
  const currentHour = floorUnixSecondsToHour(currentTime)
  const firstUpcomingIndex = points.findIndex((point) => point.time >= currentHour)
  const startIndex = firstUpcomingIndex >= 0 ? firstUpcomingIndex : 0
  return points.slice(startIndex, startIndex + count)
}

export function splitYesterdayFromDaily<T>(points: T[], forecastDays: number): {
  yesterday: T | null
  daily: T[]
} {
  const hasYesterday = points.length > forecastDays
  return {
    yesterday: hasYesterday ? points[0] : null,
    daily: points.slice(hasYesterday ? 1 : 0, (hasYesterday ? 1 : 0) + forecastDays)
  }
}
