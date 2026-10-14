export interface FixtureContext {
  readonly now: number;
}

export function createFixtureContext(now = Date.now()): FixtureContext {
  return { now };
}

export function fixtureTimestamp(
  context: FixtureContext,
  offsetSeconds = 0,
): number {
  return Math.floor(context.now / 1000) + offsetSeconds;
}

export function fixtureDate(context: FixtureContext, offsetDays = 0): string {
  const date = new Date(context.now);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function fixtureWeekStart(
  context: FixtureContext,
  offsetWeeks = 0,
): string {
  const date = new Date(context.now);
  date.setUTCHours(12, 0, 0, 0);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset + offsetWeeks * 7);
  return date.toISOString().slice(0, 10);
}
