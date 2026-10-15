import { describe, expect, it } from "vitest";
import { getSavedPostsContentPolicy } from "./saved-posts-content-policy";

describe("getSavedPostsContentPolicy", () => {
  it("caps Small at three and discloses additional fetched posts", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 6,
      expanded: false,
      postColumns: 2,
      cardDensity: "detailed",
    });

    expect(policy.visiblePostLimit).toBe(3);
    expect(policy.disclosureRequired).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.effectiveCardDensity).toBe("compact");
    expect(policy.showMetadata).toBe(false);
    expect(policy.showBodyPreview).toBe(false);
    expect(policy.columnCount).toBe(1);
  });

  it("caps Medium at six and defaults to one column", () => {
    const policy = getSavedPostsContentPolicy({
      size: "medium",
      configuredMaxPosts: 10,
      fetchedPostCount: 6,
      expanded: false,
      postColumns: 1,
      cardDensity: "compact",
    });

    expect(policy.visiblePostLimit).toBe(6);
    expect(policy.disclosureRequired).toBe(false);
    expect(policy.effectiveCardDensity).toBe("compact");
    expect(policy.columnCount).toBe(1);
  });

  it("allows two columns for Medium", () => {
    const policy = getSavedPostsContentPolicy({
      size: "medium",
      configuredMaxPosts: 20,
      fetchedPostCount: 10,
      expanded: false,
      postColumns: 2,
      cardDensity: "detailed",
    });

    expect(policy.columnCount).toBe(2);
    expect(policy.visiblePostLimit).toBe(6);
  });

  it("caps Large at six and discloses additional fetched posts", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 10,
      fetchedPostCount: 8,
      expanded: false,
      postColumns: 1,
      cardDensity: "detailed",
    });

    expect(policy.visiblePostLimit).toBe(6);
    expect(policy.disclosureRequired).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.showMetadata).toBe(true);
    expect(policy.showBodyPreview).toBe(true);
  });

  it("caps Large previews while allowing the rest of the configured posts", () => {
    const policy = getSavedPostsContentPolicy({
      size: "large",
      configuredMaxPosts: 20,
      fetchedPostCount: 20,
      expanded: false,
      postColumns: 1,
      cardDensity: "detailed",
    });

    expect(policy.visiblePostLimit).toBe(6);
    expect(policy.disclosureRequired).toBe(true);
    expect(policy.viewportOverflow).toBe("hidden");
    expect(policy.columnCount).toBe(1);
  });

  it("keeps the fixed-size widget content contained", () => {
    const policy = getSavedPostsContentPolicy({
      size: "small",
      configuredMaxPosts: 20,
      fetchedPostCount: 12,
      expanded: true,
      postColumns: 1,
      cardDensity: "detailed",
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
        postColumns: 1,
        cardDensity: "detailed",
      }).disclosureRequired,
    ).toBe(false);
  });
});
