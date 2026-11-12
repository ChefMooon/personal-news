import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  construct: vi.fn(),
  show: vi.fn(),
}));

vi.mock("../../settings/store", () => ({
  getSetting: (key: string): string | null => state.settings.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    state.settings.set(key, value);
  },
}));

vi.mock("electron", () => ({
  BrowserWindow: class {},
  Notification: class {
    static isSupported(): boolean {
      return true;
    }

    constructor(options: { title: string; body: string }) {
      state.construct(options);
    }

    show(): void {
      state.show();
    }
  },
}));

import {
  notifyRedditDigest,
  notifySavedPostsSync,
  notifyWeatherAlerts,
  notifyYoutubeLiveStart,
  notifyYoutubeNewVideos,
  notifyScriptAutoRun,
} from "../notification-service";

const gatedNotifications = [
  {
    feature: "youtube",
    notify: () =>
      notifyYoutubeNewVideos([
        {
          title: "Video",
          channelId: "channel",
          channelName: "Channel",
          notifyNewVideos: true,
          notifyLiveStart: true,
        },
      ]),
  },
  {
    feature: "youtube",
    notify: () =>
      notifyYoutubeLiveStart([
        {
          title: "Live",
          channelId: "channel",
          channelName: "Channel",
          notifyNewVideos: true,
          notifyLiveStart: true,
        },
      ]),
  },
  { feature: "saved_posts", notify: () => notifySavedPostsSync(1) },
  {
    feature: "weather",
    notify: () =>
      notifyWeatherAlerts("Location", [
        {
          id: "alert",
          kind: "rain",
          severity: "warning",
          title: "Rain",
          message: "Heavy rain expected.",
        },
      ]),
  },
  {
    feature: "reddit_digest",
    notify: () => notifyRedditDigest("info", "Digest completed."),
  },
] as const;

beforeEach(() => {
  state.settings.clear();
  state.construct.mockClear();
  state.show.mockClear();
});

describe("feature notification gating", () => {
  it.each(gatedNotifications)(
    "suppresses $feature notifications when disabled",
    ({ feature, notify }) => {
      state.settings.set(`${feature}_enabled`, "false");

      notify();

      expect(state.construct).not.toHaveBeenCalled();
    },
  );

  it.each(gatedNotifications)(
    "allows $feature notifications when its flag is absent",
    ({ notify }) => {
      notify();

      expect(state.construct).toHaveBeenCalledTimes(1);
      expect(state.show).toHaveBeenCalledTimes(1);
    },
  );

  it("does not gate general Script Manager notifications", () => {
    state.settings.set("reddit_digest_enabled", "false");

    notifyScriptAutoRun("Script", "scheduled", "info", "Run completed.");

    expect(state.construct).toHaveBeenCalledTimes(1);
    expect(state.show).toHaveBeenCalledTimes(1);
  });
});
