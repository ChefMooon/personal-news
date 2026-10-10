export function fixtureTimestamp(offsetSeconds = 0): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

export function fixtureDate(offsetDays = 0): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function fixtureWeekStart(offsetWeeks = 0): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}
