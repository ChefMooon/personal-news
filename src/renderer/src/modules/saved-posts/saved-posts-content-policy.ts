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
  totalPostCount: number;
  expanded: boolean;
}

export const SAVED_POSTS_SIZE_LIMITS: Record<WidgetSize, number> = {
  small: 3,
  medium: 8,
  large: 6,
};

export function getSavedPostsContentPolicy({
  size,
  configuredMaxPosts,
  fetchedPostCount,
  totalPostCount,
  expanded,
}: SavedPostsContentPolicyOptions): SavedPostsContentPolicy {
  void configuredMaxPosts;
  void fetchedPostCount;
  void totalPostCount;
  const visiblePostLimit = SAVED_POSTS_SIZE_LIMITS[size];
  const disclosureRequired = false;

  return {
    visiblePostLimit,
    effectiveCardDensity: size === "small" ? "compact" : "detailed",
    showMetadata: size !== "small",
    showBodyPreview: size === "large",
    disclosureRequired,
    expanded,
    viewportOverflow: "hidden",
    columnCount: size === "medium" ? 2 : 1,
  };
}
