import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  cronSchedule: vi.fn(),
  cronValidate: vi.fn(() => true),
  cronStop: vi.fn(),
}));

vi.mock("../../../settings/store", () => ({
  deleteSetting: (key: string): void => {
    state.settings.delete(key);
  },
  getSetting: (key: string): string | null => state.settings.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    state.settings.set(key, value);
  },
}));

vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd() },
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: state.cronSchedule,
    validate: state.cronValidate,
  },
}));

vi.mock("../../../harness-mode", () => ({
  isElectronHarnessRun: () => false,
}));

vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: () => false,
}));

vi.mock("../../../notifications/notification-service", () => ({
  notifyRedditDigest: vi.fn(),
  notifyScriptAutoRun: vi.fn(),
}));

import {
  applyRedditDigestEnabled,
  ensureBundledRedditDigestScript,
  runScriptById,
  ScriptManagerModule,
} from "../index";

const REDDIT_DIGEST_PATH = `${process.cwd()}\\resources\\scripts\\reddit_digest.py`;

function createDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      file_path TEXT NOT NULL,
      interpreter TEXT NOT NULL,
      args TEXT,
      schedule TEXT,
      enabled INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE script_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      script_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      exit_code INTEGER,
      stdout TEXT,
      stderr TEXT
    );
    CREATE TABLE reddit_digest_posts (
      post_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      subreddit TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      permalink TEXT NOT NULL,
      author TEXT,
      score INTEGER,
      num_comments INTEGER,
      created_utc INTEGER NOT NULL,
      fetched_at INTEGER NOT NULL,
      viewed_at INTEGER,
      PRIMARY KEY (post_id, week_start_date)
    );
  `);
  return db;
}

function addBundledScript(
  db: Database.Database,
  enabled: number,
): number {
  const result = db
    .prepare(
      `INSERT INTO scripts
        (name, description, file_path, interpreter, args, schedule, enabled, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      "Reddit Digest",
      "Collects top Reddit posts.",
      REDDIT_DIGEST_PATH,
      "python",
      JSON.stringify({ type: "weekly", hour: 9, minute: 0, days_of_week: [1] }),
      enabled,
      Math.floor(Date.now() / 1000),
    );
  const id = Number(result.lastInsertRowid);
  state.settings.set("reddit_digest_script_id", String(id));
  return id;
}

function seedRunAndPost(db: Database.Database, scriptId: number): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    "INSERT INTO script_runs (script_id, started_at, finished_at, exit_code) VALUES (?, ?, ?, 0)",
  ).run(scriptId, now, now);
  db.prepare(
    `INSERT INTO reddit_digest_posts
      (post_id, week_start_date, subreddit, title, url, permalink, created_utc, fetched_at)
     VALUES ('post-1', '2025-01-06', 'news', 'Title', 'https://example.com', '/r/news/post-1', ?, ?)`,
  ).run(now, now);
}

function countRows(db: Database.Database, table: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    }
  ).count;
}

let db: Database.Database;

beforeEach(() => {
  state.settings.clear();
  state.cronSchedule.mockReset();
  state.cronSchedule.mockReturnValue({ stop: state.cronStop });
  state.cronValidate.mockReturnValue(true);
  state.cronStop.mockClear();
  db = createDatabase();
});

afterEach(() => {
  ScriptManagerModule.shutdown();
  db.close();
});

describe("Reddit Digest feature enablement", () => {
  it("disables and unschedules the bundled row without deleting its data", () => {
    state.settings.set("reddit_digest_enabled", "true");
    state.settings.set("reddit_digest_subreddits", '["news"]');
    const scriptId = addBundledScript(db, 1);
    seedRunAndPost(db, scriptId);
    ScriptManagerModule.initialize(db);
    expect(state.cronSchedule).toHaveBeenCalledTimes(1);

    applyRedditDigestEnabled(db, false);

    expect(
      db.prepare("SELECT enabled FROM scripts WHERE id = ?").get(scriptId),
    ).toEqual({ enabled: 0 });
    expect(state.settings.get("reddit_digest_script_auto_disabled")).toBe("1");
    expect(state.cronStop).toHaveBeenCalledTimes(1);
    expect(countRows(db, "scripts")).toBe(1);
    expect(countRows(db, "script_runs")).toBe(1);
    expect(countRows(db, "reddit_digest_posts")).toBe(1);
  });

  it("does not insert the bundled row while disabled", () => {
    state.settings.set("reddit_digest_enabled", "false");
    state.settings.set("reddit_digest_subreddits", '["news"]');

    expect(ensureBundledRedditDigestScript(db)).toBeNull();
    expect(countRows(db, "scripts")).toBe(0);
  });

  it("restores an auto-disabled row and its schedule when re-enabled", () => {
    state.settings.set("reddit_digest_enabled", "false");
    state.settings.set("reddit_digest_subreddits", '["news"]');
    const scriptId = addBundledScript(db, 0);
    state.settings.set("reddit_digest_script_auto_disabled", "1");
    ScriptManagerModule.initialize(db);

    applyRedditDigestEnabled(db, true);

    expect(
      db.prepare("SELECT enabled FROM scripts WHERE id = ?").get(scriptId),
    ).toEqual({ enabled: 1 });
    expect(state.settings.has("reddit_digest_script_auto_disabled")).toBe(false);
    expect(state.cronSchedule).toHaveBeenCalledTimes(1);
  });

  it("rejects manual runs of the bundled script while disabled", async () => {
    state.settings.set("reddit_digest_enabled", "false");
    const scriptId = addBundledScript(db, 1);
    const script = {
      id: scriptId,
      name: "Reddit Digest",
      description: null,
      file_path: REDDIT_DIGEST_PATH,
      interpreter: "python",
      args: null,
      schedule: null,
      enabled: 1,
      created_at: 0,
      started_at: null,
      finished_at: null,
      exit_code: null,
      is_stale: false,
    };

    await expect(runScriptById(db, script)).rejects.toThrow(
      "Reddit Digest is disabled.",
    );
  });
});
