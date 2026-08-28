import type { DigestViewConfig } from "../../../../shared/ipc-types";

export type RedditDigestRenderMode = "columns" | "tabs";
export type RedditDigestOverflow = "hidden" | "auto";

export interface RedditDigestContentPolicy {
  effectiveMode: RedditDigestRenderMode;
  groupLimit: number;
  postsPerGroupLimit: number;
  hasMoreGroups: boolean;
  hasMorePosts: boolean;
  hasMoreContent: boolean;
  overflow: RedditDigestOverflow;
}

const MEDIUM_COLUMNS_MIN_WIDTH = 440;

export function getRedditDigestContentPolicy(
  size: "small" | "medium" | "large",
  availableWidth: number,
  config: DigestViewConfig,
  groupCount: number,
  hasPostsBeyondLimit: boolean,
  expanded: boolean,
): RedditDigestContentPolicy {
  const groupLimit =
    size === "small" ? 1 : size === "medium" ? 4 : Number.POSITIVE_INFINITY;
  const postsPerGroupLimit =
    size === "small"
      ? Math.min(config.max_posts_per_group, 2)
      : size === "medium"
        ? Math.min(config.max_posts_per_group, 4)
        : Math.max(config.max_posts_per_group, 6);
  const hasMoreGroups = groupCount > groupLimit;
  const hasMorePosts = hasPostsBeyondLimit && size !== "large";
  const effectiveMode: RedditDigestRenderMode =
    size === "small" ||
    (size === "medium" && availableWidth < MEDIUM_COLUMNS_MIN_WIDTH) ||
    config.layout_mode === "tabs"
      ? "tabs"
      : "columns";

  return {
    effectiveMode,
    groupLimit,
    postsPerGroupLimit,
    hasMoreGroups,
    hasMorePosts,
    hasMoreContent: hasMoreGroups || hasMorePosts,
    overflow: size === "large" || expanded ? "auto" : "hidden",
  };
}
