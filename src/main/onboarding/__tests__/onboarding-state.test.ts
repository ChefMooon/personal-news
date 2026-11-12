import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_IDS } from "../../../shared/feature-manifest";

const mockedDatabase = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../../db/database", () => ({
  getDb: () => mockedDatabase.current,
}));

import {
  completeOnboarding,
  getOnboardingState,
  initializeOnboardingState,
  isOnboardingRequired,
  markFeaturesSeen,
  resolveOnboardingMode,
} from "../onboarding-state";

let database: Database.Database;

function readSetting(key: string): string | null {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(
    "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  mockedDatabase.current = database;
});

afterEach(() => {
  database.close();
  mockedDatabase.current = null;
});

describe("resolveOnboardingMode", () => {
  it.each([
    [{ isPackaged: true, optIn: undefined }, "enabled"],
    [{ isPackaged: false, optIn: undefined }, "disabled"],
    [{ isPackaged: false, optIn: "1" }, "enabled"],
    [{ isPackaged: false, optIn: "0" }, "disabled"],
  ] as const)("resolves %j to %s", (options, expected) => {
    expect(resolveOnboardingMode(options)).toBe(expected);
  });
});

describe("onboarding state initialization", () => {
  it("completes a fresh profile when onboarding mode is disabled", () => {
    initializeOnboardingState({
      mode: "disabled",
      wasFreshProfile: true,
    });

    expect(readSetting("onboarding_completed")).toBe("true");
    expect(readSetting("youtube_enabled")).toBeNull();
    expect(readSetting("saved_posts_enabled")).toBeNull();
    expect(isOnboardingRequired()).toBe(false);
  });

  it("pre-disables setup-required features on a fresh enabled profile", () => {
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("onboarding_completed", "false");

    initializeOnboardingState({
      mode: "enabled",
      wasFreshProfile: true,
    });

    expect(readSetting("onboarding_completed")).toBe("false");
    expect(readSetting("youtube_enabled")).toBe("false");
    expect(readSetting("saved_posts_enabled")).toBe("false");
    expect(isOnboardingRequired()).toBe(true);
  });

  it("does not change feature flags for an existing enabled profile", () => {
    initializeOnboardingState({
      mode: "enabled",
      wasFreshProfile: false,
    });

    expect(readSetting("youtube_enabled")).toBeNull();
    expect(readSetting("saved_posts_enabled")).toBeNull();
  });

  it("does not write settings for an existing profile in disabled mode", () => {
    initializeOnboardingState({
      mode: "disabled",
      wasFreshProfile: false,
    });

    expect(
      database.prepare("SELECT COUNT(*) AS count FROM settings").get(),
    ).toEqual({ count: 0 });
  });
});

describe("onboarding IPC state operations", () => {
  beforeEach(() => {
    initializeOnboardingState({ mode: "enabled", wasFreshProfile: false });
  });

  it("returns unseen manifest features from a valid seen list", () => {
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("features_seen_ids", JSON.stringify(["youtube", "unknown"]));

    expect(getOnboardingState()).toEqual({
      required: true,
      unseenFeatureIds: FEATURE_IDS.filter((id) => id !== "youtube"),
    });
  });

  it.each([null, "not json", JSON.stringify({ ids: ["youtube"] })])(
    "returns no unseen features for a missing or malformed seen list",
    (seenList) => {
      if (seenList !== null) {
        database
          .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
          .run("features_seen_ids", seenList);
      }

      expect(getOnboardingState().unseenFeatureIds).toEqual([]);
    },
  );

  it("completes onboarding and marks every manifest feature seen", () => {
    expect(completeOnboarding()).toEqual({ ok: true, error: null });
    expect(readSetting("onboarding_completed")).toBe("true");
    expect(readSetting("features_seen_ids")).toBe(
      JSON.stringify([...FEATURE_IDS]),
    );
    expect(isOnboardingRequired()).toBe(false);
  });

  it("unions valid manifest ids and ignores unknown or non-string values", () => {
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("features_seen_ids", JSON.stringify(["weather"]));

    expect(markFeaturesSeen(["youtube", "scripts", 42])).toEqual({
      ok: true,
      error: null,
    });
    expect(JSON.parse(readSetting("features_seen_ids") ?? "[]")).toEqual([
      "weather",
      "youtube",
    ]);
  });

  it("returns an error when feature ids are not an array", () => {
    expect(markFeaturesSeen("youtube")).toEqual({
      ok: false,
      error: "Feature ids must be an array.",
    });
    expect(readSetting("features_seen_ids")).toBeNull();
  });
});
