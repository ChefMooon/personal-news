export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function getManagedTagSuggestions(
  allTags: string[],
  selectedTags: string[],
  query: string,
  limit = 8,
): string[] {
  const selectedKeys = new Set(
    selectedTags.map((tag) => tag.trim().toLowerCase()),
  );
  const normalizedQuery = query.trim().toLowerCase();
  const seen = new Set<string>();

  return allTags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (selectedKeys.has(key) || seen.has(key)) return false;
      seen.add(key);
      return normalizedQuery ? key.includes(normalizedQuery) : true;
    })
    .slice(0, limit);
}
