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
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    decryptString: vi.fn((value: Buffer) => value.toString()),
  },
}));

const settingsMap = new Map<string, string>();
vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    settingsMap.set(key, value);
  },
}));
vi.mock("../../../harness-mode", () => ({
  isElectronHarnessRun: (): boolean => false,
}));
vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: (): boolean => true,
}));
vi.mock("../../../notifications/notification-service", () => ({
  notifyYoutubeNewVideos: vi.fn(),
  notifyYoutubeLiveStart: vi.fn(),
}));

import {
  applyYouTubeEnabled,
  applyYouTubePollInterval,
  triggerYouTubePollNow,
  YouTubeModule,
} from "../index";

let db: Database.Database;

beforeEach(() => {
  settingsMap.clear();
  cronState.tasks.length = 0;
  db = new Database(":memory:");
});

afterEach(() => {
  YouTubeModule.shutdown();
  db.close();
});

function activeTaskCount(): number {
  return cronState.tasks.filter((task) => task.stop.mock.calls.length === 0)
    .length;
}

describe("YouTube feature gating", () => {
  it("does not start a scheduler on startup or interval changes while disabled", () => {
    settingsMap.set("youtube_enabled", "false");
    YouTubeModule.initialize(db);

    expect(cronState.tasks).toHaveLength(0);

    applyYouTubePollInterval(30);
    expect(cronState.tasks).toHaveLength(0);
  });

  it("stops polling when disabled and restarts exactly one scheduler when enabled", () => {
    settingsMap.set("youtube_enabled", "true");
    YouTubeModule.initialize(db);
    expect(activeTaskCount()).toBe(1);

    settingsMap.set("youtube_enabled", "false");
    applyYouTubeEnabled(false);
    expect(activeTaskCount()).toBe(0);

    settingsMap.set("youtube_enabled", "true");
    applyYouTubeEnabled(true);
    expect(cronState.tasks).toHaveLength(2);
    expect(activeTaskCount()).toBe(1);
  });

  it("rejects manual polling while YouTube is disabled", async () => {
    settingsMap.set("youtube_enabled", "false");
    YouTubeModule.initialize(db);

    await expect(triggerYouTubePollNow()).rejects.toThrow(
      "YouTube is disabled.",
    );
  });
});
