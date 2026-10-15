import type { WidgetSize } from "@shared/ipc-types";

export interface SavedPostsContentPolicy {
  visiblePostLimit: number;
  effectiveCardDensity: "compact" | "detailed";
  showMetadata: boolean;
  showBodyPreview: boolean;
  disclosureRequired: boolean;
  expanded: boolean;
  viewportOverflow: "hidden" | "auto";
  columnCount: 1 | 2;
}

interface SavedPostsContentPolicyOptions {
  size: WidgetSize;
  configuredMaxPosts: number;
  fetchedPostCount: number;
  expanded: boolean;
  postColumns: 1 | 2;
  cardDensity: "compact" | "detailed";
}

export const SAVED_POSTS_SIZE_LIMITS: Partial<Record<WidgetSize, number>> = {
  small: 3,
  medium: 6,
  large: 6,
};

export function getSavedPostsContentPolicy({
  size,
  configuredMaxPosts,
  fetchedPostCount,
  expanded,
  postColumns,
  cardDensity,
}: SavedPostsContentPolicyOptions): SavedPostsContentPolicy {
  const visiblePostLimit = Math.min(
    configuredMaxPosts,
    SAVED_POSTS_SIZE_LIMITS[size] ?? configuredMaxPosts,
  );
  const disclosureRequired = fetchedPostCount > visiblePostLimit;

  return {
    visiblePostLimit,
    effectiveCardDensity:
      size === "small"
        ? "compact"
        : size === "medium"
          ? cardDensity
          : "detailed",
    showMetadata: size !== "small",
    showBodyPreview: size === "large",
    disclosureRequired,
    expanded,
    viewportOverflow: "hidden",
    columnCount: size === "small" ? 1 : postColumns,
  };
}
