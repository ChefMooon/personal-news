export function normalizeSubredditInput(value: string): string | null {
  const normalized = value.trim().replace(/^r\//i, "").toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!/^[a-z0-9_]+$/i.test(normalized)) {
    return null;
  }
  return normalized;
}
