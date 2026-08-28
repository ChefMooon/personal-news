import type { DigestViewConfig } from "../../../../shared/ipc-types";

export type RedditDigestRenderMode = "columns" | "tabs";
export type RedditDigestOverflow = "hidden" | "auto";

export interface RedditDigestContentPolicy {
  effectiveMode: RedditDigestRenderMode;
  groupLimit: number;
  columnCount: number;
  postsPerGroupLimit: number;
  hasMoreGroups: boolean;
  hasMorePosts: boolean;
  hasMoreContent: boolean;
  overflow: RedditDigestOverflow;
}

const MEDIUM_COLUMNS_MIN_WIDTH = 440;
const REDDIT_COLUMN_MIN_WIDTH = 220;
const REDDIT_COLUMN_GAP = 16;
const REDDIT_MIN_COLUMNS = 3;
const REDDIT_MAX_COLUMNS = 5;

function getResponsiveColumnCount(
  availableWidth: number,
  groupCount: number,
): number {
  if (groupCount === 0) {
    return 0;
  }

  const widthBasedCount =
    availableWidth > 0
      ? Math.floor(
          (availableWidth + REDDIT_COLUMN_GAP) /
            (REDDIT_COLUMN_MIN_WIDTH + REDDIT_COLUMN_GAP),
        )
      : REDDIT_MIN_COLUMNS;
  const responsiveCount = Math.max(
    REDDIT_MIN_COLUMNS,
    Math.min(REDDIT_MAX_COLUMNS, widthBasedCount),
  );
  return Math.min(groupCount, responsiveCount);
}

export function getRedditDigestContentPolicy(
  size: "small" | "medium" | "large",
  availableWidth: number,
  config: DigestViewConfig,
  groupCount: number,
  hasPostsBeyondLimit: boolean,
): RedditDigestContentPolicy {
  const groupLimit = size === "small" ? 1 : Number.POSITIVE_INFINITY;
  const postsPerGroupLimit =
    size === "small"
      ? Math.min(config.max_posts_per_group, 2)
      : size === "medium"
        ? Math.min(config.max_posts_per_group, 4)
        : Math.max(config.max_posts_per_group, 6);
  const hasMoreGroups = size === "small" && groupCount > groupLimit;
  const hasMorePosts = size === "small" && hasPostsBeyondLimit;
  const effectiveMode: RedditDigestRenderMode =
    size === "small" ||
    (size === "medium" && availableWidth < MEDIUM_COLUMNS_MIN_WIDTH) ||
    config.layout_mode === "tabs"
      ? "tabs"
      : "columns";
  const columnCount =
    size === "small"
      ? 1
      : effectiveMode === "columns"
        ? getResponsiveColumnCount(availableWidth, groupCount)
        : 0;

  return {
    effectiveMode,
    groupLimit,
    columnCount,
    postsPerGroupLimit,
    hasMoreGroups,
    hasMorePosts,
    hasMoreContent: hasMoreGroups || hasMorePosts,
    overflow: size === "large" ? "auto" : "hidden",
  };
}
