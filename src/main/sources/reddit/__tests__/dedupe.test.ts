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

  it("returns null for invalid URLs", () => {
    expect(normalizeUrlForDedupe("not a url")).toBeNull();
  });
});

describe("createNtfyDedupeTracker", () => {
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
