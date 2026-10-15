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
}

export const SAVED_POSTS_SIZE_LIMITS: Partial<Record<WidgetSize, number>> = {
  small: 3,
  medium: 8,
};

export function getSavedPostsContentPolicy({
  size,
  configuredMaxPosts,
  fetchedPostCount,
  expanded,
}: SavedPostsContentPolicyOptions): SavedPostsContentPolicy {
  const visiblePostLimit =
    size === "large"
      ? configuredMaxPosts
      : (SAVED_POSTS_SIZE_LIMITS[size] ?? configuredMaxPosts);
  const disclosureRequired =
    size !== "large" && fetchedPostCount > visiblePostLimit;

  return {
    visiblePostLimit,
    effectiveCardDensity: size === "small" ? "compact" : "detailed",
    showMetadata: size !== "small",
    showBodyPreview: size === "large",
    disclosureRequired,
    expanded,
    viewportOverflow: size === "large" ? "auto" : "hidden",
    columnCount: size === "medium" ? 2 : 1,
  };
}
