import { describe, expect, it } from "vitest";
import { buildNtfySyncSummary, processNtfyMessage } from "../ntfy";

describe("buildNtfySyncSummary", () => {
  it("captures failed URLs and preserves the latest error", () => {
    const summary = buildNtfySyncSummary({
      messagesReceived: 3,
      postsIngested: 1,
      failedEntries: [
        { url: "https://example.com/one", error: "rate limited" },
        { url: "https://example.com/two", error: "bad response" },
      ],
      error: "One or more links could not be ingested.",
      lastPolledAt: 1_700_000_000,
    });

    expect(summary.failedCount).toBe(2);
    expect(summary.failedUrls).toEqual([
      "https://example.com/one",
      "https://example.com/two",
    ]);
    expect(summary.error).toBe("One or more links could not be ingested.");
  });

  it("returns an empty failure list when nothing failed", () => {
    const summary = buildNtfySyncSummary({
      messagesReceived: 2,
      postsIngested: 2,
      failedEntries: [],
      error: null,
      lastPolledAt: 1_700_000_000,
    });

    expect(summary.failedCount).toBe(0);
    expect(summary.failedUrls).toEqual([]);
    expect(summary.hasFailures).toBe(false);
  });

  it("parses one-off ntfy messages through the same helper as the app", () => {
    const parsed = processNtfyMessage('{"url":"https://example.com/test"}');

    expect(parsed).toEqual({ url: "https://example.com/test", note: null });
  });
});
