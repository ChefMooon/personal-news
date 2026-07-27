import type Database from "better-sqlite3";
import { getSetting, setSetting } from "../../settings/store";
import type { NtfySyncFailureEntry, NtfySyncSummary } from "../../../shared/ipc-types";
import { fetchMetadataForUrl } from "../link-sources";
import { processNtfyMessage } from "./ntfy-message.mjs";
import { createNtfyDedupeTracker } from "./dedupe";

export { processNtfyMessage };

interface NtfyMessage {
  id: string;
  event: string;
  message: string;
}

interface ProcessItemsWithDelayOptions {
  delayMs: number;
  delayFn?: (ms: number) => Promise<void>;
}

export async function processItemsWithDelay<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  options: ProcessItemsWithDelayOptions,
): Promise<void> {
  for (const [index, item] of items.entries()) {
    await processor(item);
    if (index < items.length - 1) {
      await options.delayFn?.(options.delayMs);
    }
  }
}

export function buildNtfySyncSummary(input: {
  messagesReceived: number;
  postsIngested: number;
  failedEntries: NtfySyncFailureEntry[];
  error: string | null;
  lastPolledAt: number | null;
  duplicateCount?: number;
  duplicateUrls?: string[];
}): NtfySyncSummary {
  const failedUrls = input.failedEntries.map((entry) => entry.url);
  const duplicateUrls = input.duplicateUrls ?? [];
  return {
    messagesReceived: input.messagesReceived,
    postsIngested: input.postsIngested,
    failedCount: failedUrls.length,
    duplicateCount: input.duplicateCount ?? duplicateUrls.length,
    failedUrls,
    duplicateUrls,
    failureEntries: input.failedEntries,
    hasFailures: failedUrls.length > 0 || duplicateUrls.length > 0 || Boolean(input.error),
    lastPolledAt: input.lastPolledAt,
    error: input.error,
  };
}

export async function pollNtfy(
  db: Database.Database,
): Promise<{ postsIngested: number; messagesReceived: number }> {
  const topic = getSetting("ntfy_topic");
  if (!topic) {
    const summary = buildNtfySyncSummary({
      messagesReceived: 0,
      postsIngested: 0,
      failedEntries: [],
      error: "No ntfy topic configured.",
      lastPolledAt: null,
    });
    setSetting("ntfy_last_sync_summary", JSON.stringify(summary));
    return { postsIngested: 0, messagesReceived: 0 };
  }

  const serverUrl = getSetting("ntfy_server_url") || "https://ntfy.sh";
  const lastMessageId = getSetting("ntfy_last_message_id");
  const since = lastMessageId ?? "all";
  const delaySecondsSetting = getSetting("saved_posts_ingest_delay_seconds");
  const delaySeconds = delaySecondsSetting
    ? Number.parseInt(delaySecondsSetting, 10)
    : 5;
  const delayMs = Math.max(5_000, Number.isFinite(delaySeconds) ? delaySeconds * 1_000 : 5_000);

  const fetchUrl = `${serverUrl}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`;
  console.log(`[ntfy] Polling: ${fetchUrl}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(fetchUrl, { signal: controller.signal });
  } catch (error) {
    clearTimeout(timeout);
    const summary = buildNtfySyncSummary({
      messagesReceived: 0,
      postsIngested: 0,
      failedEntries: [],
      error: `ntfy unreachable: ${error instanceof Error ? error.message : String(error)}`,
      lastPolledAt: null,
    });
    setSetting("ntfy_last_sync_summary", JSON.stringify(summary));
    // Rethrow so callers can distinguish network failures from 0-ingest
    throw new Error(
      `ntfy unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`ntfy returned HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  console.log(`[ntfy] Response OK — ${lines.length} line(s) received`);

  let postsIngested = 0;
  let messagesReceived = 0;
  let duplicateCount = 0;
  let lastProcessedId: string | null = null;
  const failedEntries: NtfySyncFailureEntry[] = [];
  const duplicateUrls: string[] = [];
  const dedupeTracker = createNtfyDedupeTracker(db);
  const backfilledCount = dedupeTracker.backfillExistingSavedPosts();
  if (backfilledCount > 0) {
    console.log(`[ntfy] Backfilled ${backfilledCount} existing saved-post URLs into dedupe tracker`);
  }

  const upsert = db.prepare(`
    INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      score = excluded.score,
      note = COALESCE(excluded.note, saved_posts.note),
      source = excluded.source
  `);

  const pendingUrls: Array<{ url: string; note: string | null }> = [];

  for (const line of lines) {
    let msg: NtfyMessage;
    try {
      msg = JSON.parse(line) as NtfyMessage;
    } catch {
      continue;
    }

    if (msg.event !== "message") {
      continue;
    }

    lastProcessedId = msg.id;
    messagesReceived++;

    const { url, note } = processNtfyMessage(msg.message);
    console.log(
      `[ntfy] Message ${messagesReceived}: url="${url}", note=${note !== null ? `"${note}"` : "null"}`,
    );

    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[ntfy] Skipping — not a valid HTTP URL: "${url}"`);
      continue;
    }

    if (!dedupeTracker.shouldProcessUrl(url)) {
      duplicateCount += 1;
      duplicateUrls.push(url);
      console.log(`[ntfy] Skipping duplicate URL: ${url}`);
      continue;
    }

    pendingUrls.push({ url, note });
  }

  await processItemsWithDelay(
    pendingUrls,
    async ({ url, note }) => {
      try {
        console.log(`[ntfy] Fetching metadata for: ${url}`);
        const post = await fetchMetadataForUrl(url, note);
        console.log(
          `[ntfy] Fetched post: id=${post.postId}, source=${post.source}, title="${post.title}"`,
        );
        upsert.run(
          post.postId,
          post.title,
          post.url,
          post.permalink,
          post.subreddit,
          post.author,
          post.score,
          post.body,
          post.savedAt,
          post.tags ? JSON.stringify(post.tags) : null,
          post.note,
          post.source,
        );
        postsIngested++;
        console.log(`[ntfy] Post ingested: ${post.postId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedEntries.push({ url, error: message });
        console.warn(`[ntfy] Failed to fetch metadata for ${url}:`, error);
      }
    },
    {
      delayMs,
      delayFn: async (ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
      },
    },
  );

  const lastPolledAt = Math.floor(Date.now() / 1000);
  if (lastProcessedId) {
    setSetting("ntfy_last_message_id", lastProcessedId);
  }
  setSetting("ntfy_last_polled_at", String(lastPolledAt));

  const summary = buildNtfySyncSummary({
    messagesReceived,
    postsIngested,
    failedEntries,
    error: failedEntries.length > 0 ? "One or more links could not be ingested." : null,
    lastPolledAt,
    duplicateCount,
    duplicateUrls,
  });
  setSetting("ntfy_last_sync_summary", JSON.stringify(summary));

  console.log(
    `[ntfy] Poll complete: ${messagesReceived} messages, ${postsIngested} posts ingested`,
  );
  return { postsIngested, messagesReceived };
}
