import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const { settings, fetchMetadataForUrl } = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  fetchMetadataForUrl: vi.fn(),
}));

vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settings.get(key) ?? null,
}));
vi.mock("../../link-sources", () => ({ fetchMetadataForUrl }));
vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: () => false,
}));

import { pollNtfy } from "../ntfy";

let db: Database.Database | null = null;

afterEach(() => {
  db?.close();
  db = null;
  settings.clear();
  fetchMetadataForUrl.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createNtfyDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE saved_posts (
      post_id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
      permalink TEXT NOT NULL, subreddit TEXT, author TEXT, score INTEGER,
      body TEXT, saved_at INTEGER NOT NULL, tags TEXT, note TEXT,
      source TEXT NOT NULL DEFAULT 'reddit'
    );
    CREATE TABLE ingested_links (
      url_key TEXT PRIMARY KEY, normalized_url TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'reddit'
    );
  `);
  db = database;
  return database;
}

function mockNtfyResponse(messages: Array<{ id: string; url: string }>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        messages
          .map(({ id, url }) =>
            JSON.stringify({ id, event: "message", message: JSON.stringify({ url }) }),
          )
          .join("\n"),
    }),
  );
}
import {
  buildNtfySyncSummary,
  processNtfyMessage,
  processItemsWithDelay,
} from "../ntfy";

describe("buildNtfySyncSummary", () => {
  it("captures failed URLs and preserves the latest error", () => {
    const summary = buildNtfySyncSummary({
      messagesReceived: 3,
      postsIngested: 1,
      failedEntries: [
        { url: "https://example.com/one", error: "rate limited" },
        { url: "https://example.com/two", error: "bad response" },
      ],
      error: "One or more links could not be ingested.",
      lastPolledAt: 1_700_000_000,
    });

    expect(summary.failedCount).toBe(2);
    expect(summary.failedUrls).toEqual([
      "https://example.com/one",
      "https://example.com/two",
    ]);
    expect(summary.failureEntries).toEqual([
      { url: "https://example.com/one", error: "rate limited" },
      { url: "https://example.com/two", error: "bad response" },
    ]);
    expect(summary.error).toBe("One or more links could not be ingested.");
  });

  it("returns an empty failure list when nothing failed", () => {
    const summary = buildNtfySyncSummary({
      messagesReceived: 2,
      postsIngested: 2,
      failedEntries: [],
      error: null,
      lastPolledAt: 1_700_000_000,
      duplicateCount: 0,
      duplicateUrls: [],
    });

    expect(summary.failedCount).toBe(0);
    expect(summary.failedUrls).toEqual([]);
    expect(summary.failureEntries).toEqual([]);
    expect(summary.duplicateUrls).toEqual([]);
    expect(summary.hasFailures).toBe(false);
    expect(summary.duplicateCount).toBe(0);
  });

  it("tracks duplicate skips separately from failures", () => {
    const summary = buildNtfySyncSummary({
      messagesReceived: 3,
      postsIngested: 1,
      failedEntries: [
        { url: "https://example.com/one", error: "rate limited" },
      ],
      error: "One or more links could not be ingested.",
      lastPolledAt: 1_700_000_000,
      duplicateCount: 2,
      duplicateUrls: [
        "https://example.com/duplicate-one",
        "https://example.com/duplicate-two",
      ],
    });

    expect(summary.failedCount).toBe(1);
    expect(summary.duplicateCount).toBe(2);
    expect(summary.duplicateUrls).toEqual([
      "https://example.com/duplicate-one",
      "https://example.com/duplicate-two",
    ]);
  });

  it("parses one-off ntfy messages through the same helper as the app", () => {
    const parsed = processNtfyMessage('{"url":"https://example.com/test"}');

    expect(parsed).toEqual({ url: "https://example.com/test", note: null });
  });
});

describe("processItemsWithDelay", () => {
  it("runs items sequentially and waits between each one", async () => {
    const order: string[] = [];
    const delays: number[] = [];

    await processItemsWithDelay(
      ["first", "second", "third"],
      async (value) => {
        order.push(value);
      },
      {
        delayMs: 5_000,
        delayFn: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(order).toEqual(["first", "second", "third"]);
    expect(delays).toEqual([5_000, 5_000]);
  });
});

describe("pollNtfy", () => {
  it("retries failed links by keeping the ntfy cursor before the earliest failure", async () => {
    vi.useFakeTimers();
    const database = createNtfyDatabase();
    settings.set("ntfy_topic", "saved-links");
    const one = "https://example.com/one";
    const two = "https://example.com/two";
    mockNtfyResponse([{ id: "message-1", url: one }, { id: "message-2", url: two }]);
    fetchMetadataForUrl.mockImplementation(async (url: string) => {
      if (url === one && fetchMetadataForUrl.mock.calls.filter(([callUrl]) => callUrl === one).length === 1) throw new Error("temporary failure");
      return { postId: url.endsWith("one") ? "one" : "two", title: "Link", url, permalink: url, subreddit: null, author: null, score: null, body: null, source: "generic", savedAt: 1_700_000_000, note: null, tags: null };
    });

    const firstPoll = pollNtfy(database);
    await vi.runAllTimersAsync();
    await expect(firstPoll).resolves.toEqual({ postsIngested: 1, messagesReceived: 2 });
    expect(database.prepare("SELECT value FROM settings WHERE key='ntfy_last_message_id'").get()).toBeUndefined();
    expect(database.prepare("SELECT url_key FROM ingested_links ORDER BY url_key").all()).toEqual([{ url_key: two }]);

    const retryPoll = pollNtfy(database);
    await vi.runAllTimersAsync();
    await expect(retryPoll).resolves.toEqual({ postsIngested: 1, messagesReceived: 2 });
    expect(database.prepare("SELECT post_id FROM saved_posts ORDER BY post_id").all()).toEqual([{ post_id: "one" }, { post_id: "two" }]);
    expect(database.prepare("SELECT value FROM settings WHERE key='ntfy_last_message_id'").get()).toEqual({ value: "message-2" });
  });

  it("ingests distinct X posts and counts only a replay as a duplicate", async () => {
    vi.useFakeTimers();
    const database = createNtfyDatabase();
    settings.set("ntfy_topic", "saved-links");
    const firstUrl =
      "https://x.com/jakubkrehel/status/2112204760606802214?s=46";
    const secondUrl =
      "https://x.com/jakubkrehel/status/2114379959263502712?s=46";
    fetchMetadataForUrl.mockImplementation(async (url: string) => ({
      postId: url.includes("2112204760606802214")
        ? "x_2112204760606802214"
        : "x_2114379959263502712",
      title: "X post",
      url,
      permalink: url,
      subreddit: null,
      author: null,
      score: null,
      body: null,
      savedAt: 1_700_000_000,
      tags: null,
      note: null,
      source: "x",
    }));
    mockNtfyResponse([
      { id: "message-1", url: firstUrl },
      { id: "message-2", url: secondUrl },
    ]);

    const firstPoll = pollNtfy(database);
    await vi.runAllTimersAsync();
    await expect(firstPoll).resolves.toEqual({
      postsIngested: 2,
      messagesReceived: 2,
    });
    expect(
      database
        .prepare("SELECT url FROM saved_posts ORDER BY post_id")
        .all(),
    ).toEqual([{ url: firstUrl }, { url: secondUrl }]);
    expect(
      database
        .prepare("SELECT url_key FROM ingested_links ORDER BY url_key")
        .all(),
    ).toEqual([{ url_key: firstUrl }, { url_key: secondUrl }]);

    mockNtfyResponse([{ id: "message-3", url: firstUrl }]);
    await expect(pollNtfy(database)).resolves.toEqual({
      postsIngested: 0,
      messagesReceived: 1,
    });
    expect(fetchMetadataForUrl).toHaveBeenCalledTimes(2);
    const summaryRow = database
      .prepare("SELECT value FROM settings WHERE key = 'ntfy_last_sync_summary'")
      .get() as { value: string };
    const summary = JSON.parse(summaryRow.value) as {
      duplicateCount: number;
      duplicateUrls: string[];
    };
    expect(summary.duplicateCount).toBe(1);
    expect(summary.duplicateUrls).toEqual([firstUrl]);
  });
});
