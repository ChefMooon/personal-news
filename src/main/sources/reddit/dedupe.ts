import type Database from "better-sqlite3";

export interface NtfyDedupeTracker {
  shouldProcessUrl(rawUrl: string, now?: number): boolean;
  backfillExistingSavedPosts(): number;
}

export function normalizeUrlForDedupe(rawUrl: string): string | null {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    const protocol = parsedUrl.protocol.toLowerCase();
    const hostname = parsedUrl.hostname.toLowerCase();
    const defaultPort = protocol === "http:" ? "80" : protocol === "https:" ? "443" : null;
    const port = parsedUrl.port && parsedUrl.port !== defaultPort ? `:${parsedUrl.port}` : "";
    const path = parsedUrl.pathname === "/" ? "" : parsedUrl.pathname;
    const search = parsedUrl.search || "";

    if (!path && !search) {
      return `${protocol}//${hostname}${port}`;
    }

    return `${protocol}//${hostname}${port}${path}${search}`;
  } catch {
    return null;
  }
}

export function createNtfyDedupeTracker(
  db: Database.Database,
  source = "reddit",
): NtfyDedupeTracker {
  const seenInRun = new Set<string>();

  const existingStmt = db.prepare(
    "SELECT 1 FROM ingested_links WHERE url_key = ?",
  );

  const insertStmt = db.prepare(`
    INSERT INTO ingested_links (url_key, normalized_url, first_seen_at, last_seen_at, source)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(url_key) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      source = COALESCE(ingested_links.source, excluded.source)
  `);

  function shouldProcessUrl(rawUrl: string, now = Math.floor(Date.now() / 1000)): boolean {
    const normalizedUrl = normalizeUrlForDedupe(rawUrl);
    if (!normalizedUrl) {
      return true;
    }

    if (seenInRun.has(normalizedUrl)) {
      return false;
    }

    const existing = existingStmt.get(normalizedUrl) as { "1"?: number } | undefined;
    if (existing) {
      seenInRun.add(normalizedUrl);
      return false;
    }

    insertStmt.run(normalizedUrl, normalizedUrl, now, now, source);
    seenInRun.add(normalizedUrl);
    return true;
  }

  function backfillExistingSavedPosts(): number {
    const rows = db.prepare(
      "SELECT url, saved_at FROM saved_posts WHERE url IS NOT NULL AND trim(url) <> ''",
    ).all() as Array<{ url: string; saved_at: number | null }>;

    let inserted = 0;
    const now = Math.floor(Date.now() / 1000);

    for (const row of rows) {
      const normalizedUrl = normalizeUrlForDedupe(row.url);
      if (!normalizedUrl) {
        continue;
      }

      const existing = existingStmt.get(normalizedUrl) as { "1"?: number } | undefined;
      if (existing) {
        continue;
      }

      insertStmt.run(
        normalizedUrl,
        normalizedUrl,
        row.saved_at ?? now,
        row.saved_at ?? now,
        source,
      );
      inserted += 1;
    }

    return inserted;
  }

  return {
    shouldProcessUrl,
    backfillExistingSavedPosts,
  };
}
