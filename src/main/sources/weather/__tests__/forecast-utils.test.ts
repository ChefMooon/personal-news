import { describe, expect, it } from 'vitest'
import { floorUnixSecondsToHour, mapCurrentConditions, splitYesterdayFromDaily, takeUpcomingHourly } from '../forecast-utils'

describe('weather forecast utilities', () => {
  it('floors unix seconds to the current hour', () => {
    expect(floorUnixSecondsToHour(1_700_000_999)).toBe(1_699_999_200)
  })

  it('keeps the current hour when selecting upcoming hourly points', () => {
    const base = 1_700_002_800
    const currentTime = base + 37 * 60
    const points = Array.from({ length: 30 }, (_, index) => ({
      time: base - 6 * 3600 + index * 3600,
      index
    }))

    const visible = takeUpcomingHourly(points, currentTime, 24)

    expect(visible).toHaveLength(24)
    expect(visible[0].time).toBe(floorUnixSecondsToHour(currentTime))
  })

  it('separates yesterday from a daily array without shifting today', () => {
    const points = Array.from({ length: 8 }, (_, index) => ({ date: `day-${index}` }))

    const result = splitYesterdayFromDaily(points, 7)

    expect(result.yesterday).toEqual({ date: 'day-0' })
    expect(result.daily).toHaveLength(7)
    expect(result.daily[0]).toEqual({ date: 'day-1' })
  })

  it('leaves today first when no yesterday entry exists', () => {
    const points = Array.from({ length: 7 }, (_, index) => ({ date: `day-${index}` }))

    const result = splitYesterdayFromDaily(points, 7)

    expect(result.yesterday).toBeNull()
    expect(result.daily[0]).toEqual({ date: 'day-0' })
  })

  it('prefers 15-minutely current values for current-condition details', () => {
    const current = mapCurrentConditions(
      {
        time: '2026-05-29T12:15',
        surface_pressure: 1002.5,
        visibility: 14_000,
        uv_index: 7.1,
        dew_point_2m: 12.4
      },
      {
        surfacePressure: 999,
        visibility: 10_000,
        uvIndex: 4,
        dewPoint: 8
      },
      42,
      1_000
    )

    expect(current.surfacePressure).toBe(1002.5)
    expect(current.visibility).toBe(14_000)
    expect(current.uvIndex).toBe(7.1)
    expect(current.dewPoint).toBe(12.4)
    expect(current.airQuality).toBe(42)
  })

  it('falls back to hourly values when current-condition details are missing', () => {
    const current = mapCurrentConditions(
      { time: '2026-05-29T12:15' },
      {
        surfacePressure: 999,
        visibility: 10_000,
        uvIndex: 4,
        dewPoint: 8
      },
      null,
      1_000
    )

    expect(current.surfacePressure).toBe(999)
    expect(current.visibility).toBe(10_000)
    expect(current.uvIndex).toBe(4)
    expect(current.dewPoint).toBe(8)
  })
})
