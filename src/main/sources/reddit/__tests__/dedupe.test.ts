import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { createNtfyDedupeTracker, normalizeUrlForDedupe } from "../dedupe";

describe("normalizeUrlForDedupe", () => {
  it("normalizes scheme, host, port, fragment, and trailing slash", () => {
    expect(
      normalizeUrlForDedupe("https://Example.com:443/path/?q=1#fragment"),
    ).toBe("https://example.com/path/?q=1");
  });

  it("removes default ports and trailing slash from root paths", () => {
    expect(normalizeUrlForDedupe("http://example.com:80/")).toBe(
      "http://example.com",
    );
  });

  it.each([
    "https://x.com/Someone/status/123?s=46",
    "http://twitter.com/Other/status/123/photo/1#photo",
    "https://mobile.twitter.com/i/web/status/123",
    "https://x.com/i/status/123",
  ])("deduplicates X post aliases: %s", (url) => {
    expect(normalizeUrlForDedupe(url)).toBe("https://x.com/i/web/status/123");
  });

  it("keeps distinct X pages and post ids distinct", () => {
    expect(normalizeUrlForDedupe("https://x.com/a/status/124")).not.toBe(
      normalizeUrlForDedupe("https://x.com/a/status/123"),
    );
    expect(normalizeUrlForDedupe("https://x.com/search?q=one")).not.toBe(
      normalizeUrlForDedupe("https://x.com/search?q=two"),
    );
  });

  it.each([
    "https://bsky.app/profile/Alice.Example/post/3lxyzabc123?ref=share#thread",
    "https://bsky.app/profile/alice.example/post/3lxyzabc123/",
  ])("canonicalizes Bluesky share variants: %s", (url) => {
    expect(normalizeUrlForDedupe(url)).toBe("https://bsky.app/profile/alice.example/post/3lxyzabc123");
  });

  it("keeps identical Bluesky record keys from different authors distinct", () => {
    expect(normalizeUrlForDedupe("https://bsky.app/profile/alice.example/post/3lxyzabc123"))
      .not.toBe(normalizeUrlForDedupe("https://bsky.app/profile/bob.example/post/3lxyzabc123"));
  });

  it("returns null for invalid URLs", () => {
    expect(normalizeUrlForDedupe("not a url")).toBeNull();
  });
});

describe("createNtfyDedupeTracker", () => {
  it("merges legacy X history without changing saved records or notes", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE ingested_links (url_key TEXT PRIMARY KEY, normalized_url TEXT NOT NULL, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, source TEXT);
      CREATE TABLE saved_posts (url TEXT, saved_at INTEGER, note TEXT);
      INSERT INTO saved_posts VALUES ('https://twitter.com/a/status/123?s=46', 1, 'Keep my note');
      INSERT INTO ingested_links VALUES ('https://twitter.com/a/status/123?s=46', 'https://twitter.com/a/status/123?s=46', 1, 5, 'reddit');
      INSERT INTO ingested_links VALUES ('https://x.com/b/status/123', 'https://x.com/b/status/123', 2, 8, 'reddit');
    `);
    const tracker = createNtfyDedupeTracker(db);
    expect(tracker.backfillExistingSavedPosts()).toBe(0);
    expect(
      tracker.shouldProcessUrl("https://x.com/i/web/status/123/photo/1"),
    ).toBe(false);
    expect(db.prepare("SELECT * FROM saved_posts").get()).toEqual({
      url: "https://twitter.com/a/status/123?s=46",
      saved_at: 1,
      note: "Keep my note",
    });
    expect(db.prepare("SELECT * FROM ingested_links").all()).toEqual([
      {
        url_key: "https://x.com/i/web/status/123",
        normalized_url: "https://x.com/i/web/status/123",
        first_seen_at: 1,
        last_seen_at: 8,
        source: "reddit",
      },
    ]);
    expect(
      tracker.removeUrls(["https://mobile.twitter.com/a/status/123?new=1"]),
    ).toBe(1);
    expect(tracker.shouldProcessUrl("https://x.com/a/status/123")).toBe(true);
    db.close();
  });

  it("removes matching ingested-link entries for deleted saved-post URLs", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE ingested_links (
        url_key TEXT PRIMARY KEY,
        normalized_url TEXT NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'reddit'
      );
    `);
    db.prepare(
      "INSERT INTO ingested_links (url_key, normalized_url, first_seen_at, last_seen_at, source) VALUES (?, ?, 1, 2, 'reddit')",
    ).run("https://example.com/article", "https://example.com/article");

    const tracker = createNtfyDedupeTracker(db);
    const removedCount = tracker.removeUrls(["https://Example.com/article"]);

    expect(removedCount).toBe(1);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM ingested_links").get(),
    ).toEqual({
      count: 0,
    });
  });
});
