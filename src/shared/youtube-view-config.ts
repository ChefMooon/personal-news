export const DEFAULT_LARGE_VISIBLE_CHANNEL_COUNT = 2;

export function normalizeLargeVisibleChannelCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LARGE_VISIBLE_CHANNEL_COUNT;
  }

  return Math.max(1, Math.min(5, Math.round(value)));
}
