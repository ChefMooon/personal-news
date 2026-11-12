import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  version: "2.0.0",
  isPackaged: true,
  harness: false,
  store: new Map<string, string>(),
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getVersion: () => state.version,
    get isPackaged() {
      return state.isPackaged;
    },
  },
}));
vi.mock("../settings/store", () => ({
  getSetting: state.getSetting,
  setSetting: state.setSetting,
}));
vi.mock("../harness-mode", () => ({
  isElectronHarnessRun: () => state.harness,
}));
vi.mock("./bundled-changelog", () => ({
  BUNDLED_CHANGELOG: `# Changelog

## [2.0.0] - 2026-03-01

### Added

- Two point oh feature

## [1.9.0] - 2026-02-01

### Fixed

- Nineteen fix

## [1.8.0] - 2026-01-01

### Added

- Eighteen feature
`,
}));

import {
  WHATS_NEW_LAST_SEEN_KEY,
  acknowledgeWhatsNew,
  getCurrentReleaseNotes,
  getPendingWhatsNew,
  hasBundledWhatsNewEntry,
  resolveWhatsNewMode,
} from "./whats-new";

function allItems(payload: ReturnType<typeof getPendingWhatsNew>): string[] {
  return payload?.notes.sections.flatMap((section) => section.items) ?? [];
}

beforeEach(() => {
  state.version = "2.0.0";
  state.isPackaged = true;
  state.harness = false;
  state.store.clear();
  state.getSetting.mockReset();
  state.setSetting.mockReset();
  state.getSetting.mockImplementation((key: string) => state.store.get(key) ?? null);
  state.setSetting.mockImplementation((key: string, value: string) => {
    state.store.set(key, value);
  });
  delete process.env.PERSONAL_NEWS_WHATS_NEW_PREVIEW;
});

describe("resolveWhatsNewMode", () => {
  it("covers all combinations", () => {
    expect(resolveWhatsNewMode({ isPackaged: true, harness: false, previewEnv: undefined })).toBe("normal");
    expect(resolveWhatsNewMode({ isPackaged: true, harness: false, previewEnv: "1" })).toBe("normal");
    expect(resolveWhatsNewMode({ isPackaged: false, harness: true, previewEnv: undefined })).toBe("normal");
    expect(resolveWhatsNewMode({ isPackaged: false, harness: true, previewEnv: "1" })).toBe("normal");
    expect(resolveWhatsNewMode({ isPackaged: false, harness: false, previewEnv: "1" })).toBe("preview");
    expect(resolveWhatsNewMode({ isPackaged: false, harness: false, previewEnv: "0" })).toBe("off");
    expect(resolveWhatsNewMode({ isPackaged: false, harness: false, previewEnv: undefined })).toBe("off");
  });
});

describe("getPendingWhatsNew (normal mode)", () => {
  it("seeds on fresh install without showing", () => {
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.store.get(WHATS_NEW_LAST_SEEN_KEY)).toBe("2.0.0");
  });

  it("seeds an existing profile that has no last-seen value", () => {
    state.store.set("app_theme", "dark");
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.setSetting).toHaveBeenCalledWith(WHATS_NEW_LAST_SEEN_KEY, "2.0.0");
  });

  it("returns null without writing for the same version", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "2.0.0");
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("returns only the current entry for a newer version, without writing", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "1.9.0");
    const payload = getPendingWhatsNew();
    expect(payload?.version).toBe("2.0.0");
    expect(allItems(payload)).toEqual(["Two point oh feature"]);
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("shows only the newest entry when versions were skipped", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "1.8.0");
    expect(allItems(getPendingWhatsNew())).toEqual(["Two point oh feature"]);
  });

  it("returns null without writing on downgrade", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "3.0.0");
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("writes current and returns null when the section is missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.version = "2.1.0";
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "2.0.0");
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.store.get(WHATS_NEW_LAST_SEEN_KEY)).toBe("2.1.0");
  });
});

describe("acknowledgeWhatsNew", () => {
  it("rejects a wrong version and a non-string", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "1.9.0");
    expect(acknowledgeWhatsNew("1.9.0").ok).toBe(false);
    expect(acknowledgeWhatsNew(42).ok).toBe(false);
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("writes on the correct version and is idempotent", () => {
    state.store.set(WHATS_NEW_LAST_SEEN_KEY, "1.9.0");
    expect(acknowledgeWhatsNew("2.0.0")).toEqual({ ok: true, error: null });
    expect(state.store.get(WHATS_NEW_LAST_SEEN_KEY)).toBe("2.0.0");
    expect(acknowledgeWhatsNew("2.0.0")).toEqual({ ok: true, error: null });
    expect(state.setSetting).toHaveBeenCalledTimes(1);
  });

  it("is a no-op outside normal mode", () => {
    state.isPackaged = false;
    process.env.PERSONAL_NEWS_WHATS_NEW_PREVIEW = "1";
    expect(acknowledgeWhatsNew("2.0.0").ok).toBe(true);
    expect(state.setSetting).not.toHaveBeenCalled();
  });
});

describe("preview and off modes", () => {
  it("preview returns the current entry and never writes", () => {
    state.isPackaged = false;
    process.env.PERSONAL_NEWS_WHATS_NEW_PREVIEW = "1";
    expect(allItems(getPendingWhatsNew())).toEqual(["Two point oh feature"]);
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("preview returns null when the entry is missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    state.isPackaged = false;
    state.version = "9.9.9";
    process.env.PERSONAL_NEWS_WHATS_NEW_PREVIEW = "1";
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.setSetting).not.toHaveBeenCalled();
  });

  it("off mode never touches settings", () => {
    state.isPackaged = false;
    expect(getPendingWhatsNew()).toBeNull();
    expect(state.getSetting).not.toHaveBeenCalled();
    expect(state.setSetting).not.toHaveBeenCalled();
  });
});

describe("hasBundledWhatsNewEntry", () => {
  it("reports presence of bundled entries", () => {
    expect(hasBundledWhatsNewEntry("1.9.0")).toBe(true);
    expect(hasBundledWhatsNewEntry("9.9.9")).toBe(false);
    expect(hasBundledWhatsNewEntry("not-a-version")).toBe(false);
  });
});

describe("getCurrentReleaseNotes", () => {
  it("returns notes for the current version regardless of onboarding mode", () => {
    state.isPackaged = false;
    state.harness = false;

    expect(getCurrentReleaseNotes()).toEqual({
      version: "2.0.0",
      notes: { sections: [{ heading: "Added", items: ["Two point oh feature"] }] },
    });
  });

  it("returns null when the current version has no bundled entry", () => {
    state.version = "9.9.9";
    expect(getCurrentReleaseNotes()).toBeNull();
  });

  it("does not read or write settings", () => {
    getCurrentReleaseNotes();
    expect(state.getSetting).not.toHaveBeenCalled();
    expect(state.setSetting).not.toHaveBeenCalled();
  });
});
