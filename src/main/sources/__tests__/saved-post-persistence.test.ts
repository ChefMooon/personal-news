import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { SAVED_POST_UPSERT_SQL, persistSavedPost } from "../saved-post-persistence";

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

  it("rekeys a legacy Bluesky row only when its URL proves the same author and rkey", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE saved_posts (post_id TEXT PRIMARY KEY,title TEXT,url TEXT,permalink TEXT,subreddit TEXT,author TEXT,score INTEGER,body TEXT,saved_at INTEGER,tags TEXT,note TEXT,source TEXT,viewed_at INTEGER)`);
    db.exec("INSERT INTO saved_posts (post_id,title,url,permalink,saved_at,source,note,tags,viewed_at) VALUES ('bsky_3lxyzabc123','My title','https://bsky.app/profile/alice.example/post/3lxyzabc123','https://bsky.app/profile/alice.example/post/3lxyzabc123',1,'bsky','Keep this','[\"mine\"]',7)");
    persistSavedPost(db, { postId: "bsky_alice.example_3lxyzabc123", title: "Post by @alice.example", url: "https://bsky.app/profile/alice.example/post/3lxyzabc123", permalink: "https://bsky.app/profile/alice.example/post/3lxyzabc123", subreddit: null, author: "alice.example", score: null, body: "Fetched", source: "bsky", savedAt: 2, note: null, tags: ["alice.example"] });
    expect(db.prepare("SELECT post_id,title,note,tags,viewed_at,body FROM saved_posts").all()).toEqual([{ post_id: "bsky_alice.example_3lxyzabc123", title: "My title", note: "Keep this", tags: '["mine"]', viewed_at: 7, body: "Fetched" }]);
    db.close();
  });

  it("never adopts an rkey-only row owned by another Bluesky author", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE saved_posts (post_id TEXT PRIMARY KEY,title TEXT,url TEXT,permalink TEXT,subreddit TEXT,author TEXT,score INTEGER,body TEXT,saved_at INTEGER,tags TEXT,note TEXT,source TEXT,viewed_at INTEGER)`);
    db.exec("INSERT INTO saved_posts (post_id,title,url,permalink,saved_at,source) VALUES ('bsky_3lxyzabc123','Bob','https://bsky.app/profile/bob.example/post/3lxyzabc123','https://bsky.app/profile/bob.example/post/3lxyzabc123',1,'bsky')");
    persistSavedPost(db, { postId: "bsky_alice.example_3lxyzabc123", title: "Alice", url: "https://bsky.app/profile/alice.example/post/3lxyzabc123", permalink: "https://bsky.app/profile/alice.example/post/3lxyzabc123", subreddit: null, author: "alice.example", score: null, body: null, source: "bsky", savedAt: 2, note: null, tags: null });
    expect(db.prepare("SELECT post_id,title FROM saved_posts ORDER BY post_id").all()).toEqual([{ post_id: "bsky_3lxyzabc123", title: "Bob" }, { post_id: "bsky_alice.example_3lxyzabc123", title: "Alice" }]);
    db.close();
  });

  it("does not overwrite a canonical row when a matching legacy row also exists", () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE saved_posts (post_id TEXT PRIMARY KEY,title TEXT,url TEXT,permalink TEXT,subreddit TEXT,author TEXT,score INTEGER,body TEXT,saved_at INTEGER,tags TEXT,note TEXT,source TEXT,viewed_at INTEGER)`);
    db.exec("INSERT INTO saved_posts (post_id,title,url,permalink,saved_at,source,note,tags,viewed_at) VALUES ('bsky_3lxyzabc123','Legacy','https://bsky.app/profile/alice.example/post/3lxyzabc123','https://bsky.app/profile/alice.example/post/3lxyzabc123',1,'bsky','legacy note','[\"legacy\"]',1)");
    db.exec("INSERT INTO saved_posts (post_id,title,url,permalink,saved_at,source,note,tags,viewed_at) VALUES ('bsky_alice.example_3lxyzabc123','Canonical','https://bsky.app/profile/alice.example/post/3lxyzabc123','https://bsky.app/profile/alice.example/post/3lxyzabc123',2,'bsky','canonical note','[\"canonical\"]',2)");
    persistSavedPost(db, { postId: "bsky_alice.example_3lxyzabc123", title: "fallback", url: "https://www.bsky.app/profile/alice.example/post/3lxyzabc123?share=1", permalink: "https://www.bsky.app/profile/alice.example/post/3lxyzabc123?share=1", subreddit: null, author: "alice.example", score: null, body: null, source: "bsky", savedAt: 3, note: null, tags: null });
    expect(db.prepare("SELECT post_id,title,note,tags,viewed_at FROM saved_posts ORDER BY post_id").all()).toEqual([
      { post_id: "bsky_3lxyzabc123", title: "Legacy", note: "legacy note", tags: '["legacy"]', viewed_at: 1 },
      { post_id: "bsky_alice.example_3lxyzabc123", title: "Canonical", note: "canonical note", tags: '["canonical"]', viewed_at: 2 },
    ]);
    db.close();
  });
});
