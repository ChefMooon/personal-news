import { describe, expect, it } from 'vitest'
import { floorUnixSecondsToHour, splitYesterdayFromDaily, takeUpcomingHourly } from '../forecast-utils'

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
})
