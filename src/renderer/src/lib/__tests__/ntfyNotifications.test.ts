import { describe, expect, it } from "vitest";
import { buildNtfyFailureToastContent } from "../ntfyNotifications";
import type { NtfySyncSummary } from "../../../../shared/ipc-types";

function createSummary(failedUrls: string[]): NtfySyncSummary {
  return {
    messagesReceived: 2,
    postsIngested: 1,
    failedCount: failedUrls.length,
    duplicateCount: 0,
    failedUrls,
    duplicateUrls: [],
    failureEntries: failedUrls.map((url) => ({ url, error: "failed" })),
    hasFailures: failedUrls.length > 0,
    lastPolledAt: 1_700_000_000,
    error: "One or more links could not be ingested.",
  };
}

describe("buildNtfyFailureToastContent", () => {
  it("returns null when there are no failed URLs", () => {
    expect(buildNtfyFailureToastContent(null)).toBeNull();
    expect(buildNtfyFailureToastContent(createSummary([]))).toBeNull();
  });

  it("includes the failed URLs in the notification description", () => {
    const content = buildNtfyFailureToastContent(
      createSummary(["https://example.com/one", "https://example.com/two"]),
    );

    expect(content).not.toBeNull();
    expect(content?.title).toBe("Some URLs could not be ingested");
    expect(content?.description).toContain("https://example.com/one");
    expect(content?.description).toContain("https://example.com/two");
  });
});
