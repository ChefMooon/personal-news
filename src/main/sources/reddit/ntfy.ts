import type Database from "better-sqlite3";
import { getSetting } from "../../settings/store";
import type {
  NtfySyncFailureEntry,
  NtfySyncSummary,
} from "../../../shared/ipc-types";
import { fetchMetadataForUrl } from "../link-sources";
import { processNtfyMessage } from "./ntfy-message.mjs";
import { createNtfyDedupeTracker } from "./dedupe";
import { isDevTestDataActive } from "../../dev-test-data";
import { fetchBoundedText, parseHttpUrl } from "../../security/network";

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
    hasFailures:
      failedUrls.length > 0 || duplicateUrls.length > 0 || Boolean(input.error),
    lastPolledAt: input.lastPolledAt,
    error: input.error,
  };
}

export async function pollNtfy(
  db: Database.Database,
  trigger: "automatic" | "manual" = "manual",
): Promise<{ postsIngested: number; messagesReceived: number }> {
  const isPaused = () => trigger === "automatic" && isDevTestDataActive(db);
  if (isPaused()) {
    return { postsIngested: 0, messagesReceived: 0 };
  }

  const writeSyncSettings = (settings: Record<string, string>): boolean =>
    db.transaction(() => {
      if (isPaused()) {
        return false;
      }
      const write = db.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      );
      for (const [key, value] of Object.entries(settings)) {
        write.run(key, value);
      }
      return true;
    })();

  const topic = getSetting("ntfy_topic");
  if (!topic) {
    const summary = buildNtfySyncSummary({
      messagesReceived: 0,
      postsIngested: 0,
      failedEntries: [],
      error: "No ntfy topic configured.",
      lastPolledAt: null,
    });
    writeSyncSettings({
      ntfy_last_sync_summary: JSON.stringify(summary),
    });
    return { postsIngested: 0, messagesReceived: 0 };
  }

  const serverUrl = getSetting("ntfy_server_url") || "https://ntfy.sh";
  const lastMessageId = getSetting("ntfy_last_message_id");
  const since = lastMessageId ?? "all";
  const delaySecondsSetting = getSetting("saved_posts_ingest_delay_seconds");
  const delaySeconds = delaySecondsSetting
    ? Number.parseInt(delaySecondsSetting, 10)
    : 5;
  const delayMs = Math.max(
    5_000,
    Number.isFinite(delaySeconds) ? delaySeconds * 1_000 : 5_000,
  );

  let configuredServer: URL;
  try {
    configuredServer = parseHttpUrl(serverUrl);
  } catch {
    throw new Error("ntfy server URL must be a valid HTTP(S) URL.");
  }
  configuredServer.pathname = `${configuredServer.pathname.replace(/\/$/, "")}/${encodeURIComponent(topic)}/json`;
  configuredServer.searchParams.set("poll", "1");
  configuredServer.searchParams.set("since", since);
  const fetchUrl = configuredServer.toString();
  console.log(`[ntfy] Polling: ${fetchUrl}`);

  let response: Response;
  let text: string;
  try {
    ({ response, text } = await fetchBoundedText(fetchUrl, {
      timeoutMs: 10_000,
      maxBytes: 1_000_000,
      maxRedirects: 3,
      validateRedirect: (_from, to) => to.origin === configuredServer.origin,
    }));
  } catch (error) {
    const summary = buildNtfySyncSummary({
      messagesReceived: 0,
      postsIngested: 0,
      failedEntries: [],
      error: `ntfy unreachable: ${error instanceof Error ? error.message : String(error)}`,
      lastPolledAt: null,
    });
    writeSyncSettings({
      ntfy_last_sync_summary: JSON.stringify(summary),
    });
    // Rethrow so callers can distinguish network failures from 0-ingest
    throw new Error(
      `ntfy unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(`ntfy returned HTTP ${response.status}`);
  }

  if (isPaused()) {
    return { postsIngested: 0, messagesReceived: 0 };
  }
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  console.log(`[ntfy] Response OK — ${lines.length} line(s) received`);

  let postsIngested = 0;
  let messagesReceived = 0;
  let duplicateCount = 0;
  let lastProcessedId: string | null = null;
  const failedEntries: NtfySyncFailureEntry[] = [];
  const duplicateUrls: string[] = [];
  const dedupeTracker = createNtfyDedupeTracker(
    db,
    "reddit",
    () => !isPaused(),
  );
  const backfilledCount = isPaused() ? 0 : dedupeTracker.backfillExistingSavedPosts();
  if (backfilledCount > 0) {
    console.log(
      `[ntfy] Backfilled ${backfilledCount} existing saved-post URLs into dedupe tracker`,
    );
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

  const pendingUrls: Array<{ url: string; note: string | null; retryCursor: string | null }> = [];

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

    const retryCursor = lastProcessedId ?? lastMessageId;
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

    pendingUrls.push({ url, note, retryCursor });
  }

  let retryCursor: string | null | undefined;

  await processItemsWithDelay(
    pendingUrls,
    async ({ url, note, retryCursor: itemRetryCursor }) => {
      if (isPaused()) {
        return;
      }
      try {
        console.log(`[ntfy] Fetching metadata for: ${url}`);
        const post = await fetchMetadataForUrl(url, note);
        console.log(
          `[ntfy] Fetched post: id=${post.postId}, source=${post.source}, title="${post.title}"`,
        );
        const inserted = db.transaction(() => {
          if (isPaused()) {
            return false;
          }
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
          return true;
        })();
        if (inserted) {
          postsIngested++;
          console.log(`[ntfy] Post ingested: ${post.postId}`);
        }
      } catch (error) {
        // Earlier versions marked URLs as seen before metadata fetch completed. Release
        // this URL so a failed link can be retried on the next ntfy poll.
        dedupeTracker.removeUrls([url]);
        if (retryCursor === undefined) retryCursor = itemRetryCursor;
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

  if (isPaused()) {
    return { postsIngested, messagesReceived };
  }

  const lastPolledAt = Math.floor(Date.now() / 1000);
  const summary = buildNtfySyncSummary({
    messagesReceived,
    postsIngested,
    failedEntries,
    error:
      failedEntries.length > 0
        ? "One or more links could not be ingested."
        : null,
    lastPolledAt,
    duplicateCount,
    duplicateUrls,
  });
  const syncSettings: Record<string, string> = {
    ntfy_last_polled_at: String(lastPolledAt),
    ntfy_last_sync_summary: JSON.stringify(summary),
  };
  if (retryCursor !== undefined) {
    if (retryCursor) syncSettings.ntfy_last_message_id = retryCursor;
  } else if (lastProcessedId) {
    syncSettings.ntfy_last_message_id = lastProcessedId;
  }
  writeSyncSettings(syncSettings);

  console.log(
    `[ntfy] Poll complete: ${messagesReceived} messages, ${postsIngested} posts ingested`,
  );
  return { postsIngested, messagesReceived };
}
