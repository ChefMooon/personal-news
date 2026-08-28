import { describe, expect, it } from "vitest";
import { getSavedPostsContentPolicy } from "./saved-posts-content-policy";

describe("getSavedPostsContentPolicy", () => {
  it("caps Small and keeps the collapsed viewport from scrolling", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 6,
      totalPostCount: 20,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(3);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.effectiveCardDensity).toBe("compact");
    expect(policy.showMetadata).toBe(false);
    expect(policy.showBodyPreview).toBe(false);
  });

  it("caps Medium globally so grouped posts cannot multiply the row budget", () => {
    const policy = getSavedPostsContentPolicy({
      size: "medium",
      configuredMaxPosts: 5,
      fetchedPostCount: 5,
      totalPostCount: 5,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(8);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.effectiveCardDensity).toBe("detailed");
    expect(policy.columnCount).toBe(2);
    expect(policy.disclosureRequired).toBe(false);
  });

  it("caps Large at six posts without scrolling or disclosure", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 3,
      fetchedPostCount: 3,
      totalPostCount: 20,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(6);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.showMetadata).toBe(true);
    expect(policy.showBodyPreview).toBe(true);
  });

  it("limits Large to six when the configured pool is larger", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 20,
      fetchedPostCount: 20,
      totalPostCount: 20,
      expanded: false,
    });

    expect(policy.visiblePostLimit).toBe(6);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.columnCount).toBe(1);
  });

  it("keeps the fixed-size widget content contained", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 12,
      totalPostCount: 12,
      expanded: true,
    });

    expect(policy.disclosureRequired).toBe(false);
    expect(policy.expanded).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
  });

  it("does not require disclosure for empty, loading, or error-shaped zero counts", () => {
    expect(
      getSavedPostsContentPolicy({
        size: "small",
        configuredMaxPosts: 5,
        fetchedPostCount: 0,
        totalPostCount: 0,
        expanded: false,
      }).disclosureRequired,
    ).toBe(false);
  });
});
