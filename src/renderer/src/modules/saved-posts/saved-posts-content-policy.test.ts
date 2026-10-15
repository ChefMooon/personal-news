import { describe, expect, it } from "vitest";
import { getSavedPostsContentPolicy } from "./saved-posts-content-policy";

describe("getSavedPostsContentPolicy", () => {
  it("caps Small at three and discloses additional fetched posts", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 6,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(3);
    expect(policy.disclosureRequired).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.effectiveCardDensity).toBe("compact");
    expect(policy.showMetadata).toBe(false);
    expect(policy.showBodyPreview).toBe(false);
  });

  it("caps Medium at eight", () => {
    const policy = getSavedPostsContentPolicy({
      size: "medium",
      configuredMaxPosts: 5,
      fetchedPostCount: 5,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(8);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.effectiveCardDensity).toBe("detailed");
    expect(policy.columnCount).toBe(2);
  });

  it("shows all fetched Large posts and allows the viewport to scroll", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 3,
      fetchedPostCount: 3,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(3);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.viewportOverflow).toBe("auto");
    expect(policy.showMetadata).toBe(true);
    expect(policy.showBodyPreview).toBe(true);
  });

  it("uses the configured fetch limit for Large", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 20,
      fetchedPostCount: 20,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(20);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.viewportOverflow).toBe("auto");
    expect(policy.columnCount).toBe(1);
  });

  it("keeps the fixed-size widget content contained", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 12,
      expanded: true,
    });

    expect(policy.disclosureRequired).toBe(true);
    expect(policy.expanded).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
  });

  it("does not require disclosure for empty, loading, or error-shaped zero counts", () => {
    expect(
      getSavedPostsContentPolicy({
        size: "small",
        configuredMaxPosts: 5,
        fetchedPostCount: 0,
        expanded: false,
      }).disclosureRequired,
    ).toBe(false);
  });
});
