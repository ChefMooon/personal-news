export function floorUnixSecondsToHour(unixSeconds: number): number {
  return Math.floor(unixSeconds / 3600) * 3600
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
