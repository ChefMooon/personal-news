import { describe, expect, it } from "vitest";
import { DEFAULT_DIGEST_VIEW_CONFIG } from "../../hooks/useRedditDigestConfig";
import { getRedditDigestContentPolicy } from "./reddit-content-policy";

describe("getRedditDigestContentPolicy", () => {
  it("uses one compact tabbed group for Small without scrolling while collapsed", () => {
    expect(
      getRedditDigestContentPolicy(
        "small",
        320,
        DEFAULT_DIGEST_VIEW_CONFIG,
        3,
        true,
      ),
    ).toEqual({
      effectiveMode: "tabs",
      groupLimit: 1,
      postsPerGroupLimit: 2,
      hasMoreGroups: true,
      hasMorePosts: true,
      hasMoreContent: true,
      columnCount: 1,
      overflow: "hidden",
    });
  });

  it("keeps the Small widget viewport contained without disclosure", () => {
    expect(
      getRedditDigestContentPolicy(
        "small",
        320,
        DEFAULT_DIGEST_VIEW_CONFIG,
        1,
        false,
      ).overflow,
    ).toBe("hidden");
  });

  it("uses Medium columns only when the allocated content is wide enough", () => {
    expect(
      getRedditDigestContentPolicy(
        "medium",
        439,
        DEFAULT_DIGEST_VIEW_CONFIG,
        4,
        false,
      ).effectiveMode,
    ).toBe("tabs");
    expect(
      getRedditDigestContentPolicy(
        "medium",
        440,
        DEFAULT_DIGEST_VIEW_CONFIG,
        4,
        false,
      ).effectiveMode,
    ).toBe("columns");
    expect(
      getRedditDigestContentPolicy(
        "medium",
        660,
        DEFAULT_DIGEST_VIEW_CONFIG,
        6,
        false,
      ).columnCount,
    ).toBe(3);
    expect(
      getRedditDigestContentPolicy(
        "medium",
        928,
        DEFAULT_DIGEST_VIEW_CONFIG,
        6,
        false,
      ).columnCount,
    ).toBe(4);
    expect(
      getRedditDigestContentPolicy(
        "medium",
        1164,
        DEFAULT_DIGEST_VIEW_CONFIG,
        6,
        false,
      ).columnCount,
    ).toBe(5);
  });

  it("preserves the configured mode while showing all Medium groups", () => {
    const policy = getRedditDigestContentPolicy(
      "medium",
      800,
      {
        ...DEFAULT_DIGEST_VIEW_CONFIG,
        layout_mode: "tabs",
        max_posts_per_group: 10,
      },
      6,
      true,
    );

    expect(policy).toMatchObject({
      effectiveMode: "tabs",
      groupLimit: Number.POSITIVE_INFINITY,
      postsPerGroupLimit: 4,
      hasMoreGroups: false,
      hasMorePosts: false,
      hasMoreContent: false,
      columnCount: 0,
      overflow: "hidden",
    });
  });

  it("allows Large to show configured content in its viewport", () => {
    expect(
      getRedditDigestContentPolicy(
        "large",
        800,
        DEFAULT_DIGEST_VIEW_CONFIG,
        12,
        true,
      ),
    ).toMatchObject({
      groupLimit: Number.POSITIVE_INFINITY,
      postsPerGroupLimit: 6,
      hasMoreGroups: false,
      hasMorePosts: false,
      hasMoreContent: false,
      columnCount: 3,
      overflow: "auto",
    });
  });

  it("clamps Medium and Large columns to the available group count", () => {
    expect(
      getRedditDigestContentPolicy(
        "medium",
        1100,
        DEFAULT_DIGEST_VIEW_CONFIG,
        1,
        false,
      ).columnCount,
    ).toBe(1);
    expect(
      getRedditDigestContentPolicy(
        "large",
        1100,
        DEFAULT_DIGEST_VIEW_CONFIG,
        2,
        false,
      ).columnCount,
    ).toBe(2);
    expect(
      getRedditDigestContentPolicy(
        "large",
        1100,
        DEFAULT_DIGEST_VIEW_CONFIG,
        0,
        false,
      ).columnCount,
    ).toBe(0);
  });
});
