import { describe, expect, it } from "vitest";
import {
  buildNtfyWarningDismissalKey,
  getDismissedNtfyWarningKey,
  setDismissedNtfyWarningKey,
  shouldShowNtfyWarning,
} from "../ntfyWarningDismissal";

function createStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
  } as Storage;
}

describe("ntfyWarningDismissal", () => {
  it("keeps a warning hidden when the dismissal key matches the current warning", () => {
    const currentKey = buildNtfyWarningDismissalKey({
      isStale: true,
      lastPolledAt: 100,
      summary: {
        hasFailures: true,
        failedCount: 2,
        failedUrls: ["https://example.com/1"],
        duplicateCount: 0,
        failureEntries: [],
        duplicateUrls: [],
        messagesReceived: 0,
        postsIngested: 0,
        lastPolledAt: 100,
        error: null,
      },
    });
    const storage = createStorage();

    setDismissedNtfyWarningKey(currentKey, storage);

    expect(getDismissedNtfyWarningKey(storage)).toBe(currentKey);
    expect(
      shouldShowNtfyWarning({
        currentWarningKey: currentKey,
        dismissalKey: getDismissedNtfyWarningKey(storage),
      }),
    ).toBe(false);
  });

  it("shows the warning again when the warning key changes", () => {
    const initialKey = buildNtfyWarningDismissalKey({
      isStale: true,
      lastPolledAt: 100,
      summary: {
        hasFailures: true,
        failedCount: 1,
        failedUrls: ["https://example.com/1"],
        duplicateCount: 0,
        failureEntries: [],
        duplicateUrls: [],
        messagesReceived: 0,
        postsIngested: 0,
        lastPolledAt: 100,
        error: null,
      },
    });
    const changedKey = buildNtfyWarningDismissalKey({
      isStale: true,
      lastPolledAt: 200,
      summary: {
        hasFailures: true,
        failedCount: 2,
        failedUrls: ["https://example.com/1", "https://example.com/2"],
        duplicateCount: 0,
        failureEntries: [],
        duplicateUrls: [],
        messagesReceived: 0,
        postsIngested: 0,
        lastPolledAt: 200,
        error: null,
      },
    });
    const storage = createStorage();

    setDismissedNtfyWarningKey(initialKey, storage);

    expect(
      shouldShowNtfyWarning({
        currentWarningKey: changedKey,
        dismissalKey: getDismissedNtfyWarningKey(storage),
      }),
    ).toBe(true);
  });
});
