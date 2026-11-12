import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cronState = vi.hoisted(() => ({
  tasks: [] as Array<{
    stop: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => {
      const task = { stop: vi.fn(), destroy: vi.fn() };
      cronState.tasks.push(task);
      return task;
    }),
  },
}));
vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

const settingsMap = new Map<string, string>();
vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
}));
vi.mock("../../../harness-mode", () => ({
  isElectronHarnessRun: (): boolean => false,
}));
vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: (): boolean => true,
}));
vi.mock("../../../sources/reddit/ntfy", () => ({
  pollNtfy: vi.fn().mockResolvedValue({
    postsIngested: 0,
    messagesReceived: 0,
    linkOnlyCount: 0,
  }),
}));
vi.mock("../../../notifications/notification-service", () => ({
  notifySavedPostsSync: vi.fn(),
}));

import {
  applyNtfyPollInterval,
  applySavedPostsEnabled,
  RedditModule,
  triggerNtfyPoll,
} from "../index";

let db: Database.Database;

beforeEach(() => {
  settingsMap.clear();
  cronState.tasks.length = 0;
  db = new Database(":memory:");
});

afterEach(() => {
  RedditModule.shutdown();
  db.close();
});

function activeTaskCount(): number {
  return cronState.tasks.filter((task) => task.stop.mock.calls.length === 0)
    .length;
}

describe("Saved Posts feature gating", () => {
  it("does not start a scheduler or restart one on interval changes while disabled", () => {
    settingsMap.set("saved_posts_enabled", "false");
    RedditModule.initialize(db);

    expect(cronState.tasks).toHaveLength(0);

    applyNtfyPollInterval(30);
    expect(cronState.tasks).toHaveLength(0);
  });

  it("stops ntfy polling when disabled and restarts exactly one scheduler when enabled", () => {
    settingsMap.set("saved_posts_enabled", "true");
    RedditModule.initialize(db);
    expect(activeTaskCount()).toBe(1);

    settingsMap.set("saved_posts_enabled", "false");
    applySavedPostsEnabled(false);
    expect(activeTaskCount()).toBe(0);

    settingsMap.set("saved_posts_enabled", "true");
    applySavedPostsEnabled(true);
    expect(cronState.tasks).toHaveLength(2);
    expect(activeTaskCount()).toBe(1);
  });

  it("rejects manual ntfy polling while Saved Posts is disabled", async () => {
    settingsMap.set("saved_posts_enabled", "false");
    RedditModule.initialize(db);

    await expect(triggerNtfyPoll()).rejects.toThrow("Saved Posts is disabled.");
  });
});
