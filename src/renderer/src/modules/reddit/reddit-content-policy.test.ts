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
        false,
      ),
    ).toEqual({
      effectiveMode: "tabs",
      groupLimit: 1,
      postsPerGroupLimit: 2,
      hasMoreGroups: true,
      hasMorePosts: true,
      hasMoreContent: true,
      overflow: "hidden",
    });
  });

  it("enables the single content viewport after Small disclosure", () => {
    expect(
      getRedditDigestContentPolicy(
        "small",
        320,
        DEFAULT_DIGEST_VIEW_CONFIG,
        1,
        false,
        true,
      ).overflow,
    ).toBe("auto");
  });

  it("uses Medium columns only when the allocated content is wide enough", () => {
    expect(
      getRedditDigestContentPolicy(
        "medium",
        439,
        DEFAULT_DIGEST_VIEW_CONFIG,
        4,
        false,
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
        false,
      ).effectiveMode,
    ).toBe("columns");
  });

  it("preserves the configured mode as input while capping Medium content", () => {
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
      false,
    );

    expect(policy).toMatchObject({
      effectiveMode: "tabs",
      groupLimit: 4,
      postsPerGroupLimit: 4,
      hasMoreGroups: true,
      hasMorePosts: true,
      hasMoreContent: true,
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
        false,
      ),
    ).toMatchObject({
      groupLimit: Number.POSITIVE_INFINITY,
      postsPerGroupLimit: 6,
      hasMoreGroups: false,
      hasMorePosts: false,
      hasMoreContent: false,
      overflow: "auto",
    });
  });
});
