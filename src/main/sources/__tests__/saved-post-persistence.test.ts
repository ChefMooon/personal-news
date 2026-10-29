import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SAVED_POST_UPSERT_SQL } from "../saved-post-persistence";

// Execute the SQL used by both manual IPC saves and ntfy imports against an
// isolated database; existing personal notes, tags and viewed state must survive.
describe("saved-post duplicate persistence", () => {
  it("retains X titles and notes for note-less resaves and accepts an intentional note update", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE saved_posts (
      post_id TEXT PRIMARY KEY, title TEXT, url TEXT, permalink TEXT,
      subreddit TEXT, author TEXT, score INTEGER, body TEXT, saved_at INTEGER,
      tags TEXT, note TEXT, source TEXT, viewed_at INTEGER
    )`);
    const save = db.prepare(SAVED_POST_UPSERT_SQL);
    save.run(
      "x_123",
      "Original useful title",
      "https://x.com/a/status/123",
      "original permalink",
      null,
      "a",
      null,
      "original body",
      1,
      '["personal"]',
      "Original note",
      "x",
    );
    db.prepare("UPDATE saved_posts SET viewed_at = 10").run();
    save.run(
      "x_123",
      "X post 123",
      "https://x.com/i/status/123",
      "new permalink",
      null,
      null,
      null,
      null,
      2,
      null,
      null,
      "x",
    );
    expect(
      db
        .prepare(
          "SELECT title, note, tags, saved_at, viewed_at, body, author FROM saved_posts",
        )
        .get(),
    ).toEqual({
      title: "Original useful title",
      note: "Original note",
      tags: '["personal"]',
      saved_at: 1,
      viewed_at: 10,
      body: "original body",
      author: "a",
    });
    save.run(
      "x_123",
      "Updated note",
      "https://x.com/a/status/123",
      "new permalink",
      null,
      "a",
      null,
      null,
      3,
      null,
      "Updated note",
      "x",
    );
    expect(db.prepare("SELECT title, note FROM saved_posts").get()).toEqual({
      title: "Updated note",
      note: "Updated note",
    });
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM saved_posts").get(),
    ).toEqual({ count: 1 });
    db.close();
  });

  it("fills a missing X body on enrichment and preserves it after later lookup failures", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE saved_posts (
      post_id TEXT PRIMARY KEY, title TEXT, url TEXT, permalink TEXT,
      subreddit TEXT, author TEXT, score INTEGER, body TEXT, saved_at INTEGER,
      tags TEXT, note TEXT, source TEXT, viewed_at INTEGER
    )`);
    const save = db.prepare(SAVED_POST_UPSERT_SQL);
    save.run("x_123", "Post by @a", "https://x.com/a/status/123", "url", null, "a", null, null, 1, null, null, "x");
    save.run("x_123", "Post by @a", "https://x.com/a/status/123", "url", null, "a", null, "Fetched post text", 2, null, null, "x");
    save.run("x_123", "Post by @a", "https://x.com/a/status/123", "url", null, "a", null, null, 3, null, null, "x");
    expect(db.prepare("SELECT body FROM saved_posts").get()).toEqual({ body: "Fetched post text" });
    db.close();
  });
});
