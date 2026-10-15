import React from "react";
import { Button } from "../../components/ui/button";
import { type LinkSource, type SavedPost } from "../../../../shared/ipc-types";
import { SavedPostCard, type SavedPostCardConfig } from "./SavedPostCard";
import { SAVED_POST_SOURCE_LABELS } from "./saved-posts-constants";

export interface SavedPostGroup {
  source: LinkSource;
  posts: SavedPost[];
}

interface SavedPostsListProps {
  posts: SavedPost[];
  loading: boolean;
  error: string | null;
  allTags: string[];
  cardConfig: SavedPostCardConfig;
  groupedPosts: SavedPostGroup[] | null;
  showGroupHeaders: boolean;
  columnCount: 1 | 2;
  expanded: boolean;
  visiblePostLimit: number;
  disclosureRequired: boolean;
  viewportId: string;
  onToggleExpanded: () => void;
  onOpen: (post: SavedPost) => void;
  onPeek: (post: SavedPost) => void;
  onToggleViewed: (post: SavedPost, viewed: boolean) => void;
  onAfterMutation: () => Promise<void> | void;
}

export function SavedPostsList({
  posts,
  loading,
  error,
  allTags,
  cardConfig,
  groupedPosts,
  showGroupHeaders,
  columnCount,
  expanded,
  visiblePostLimit,
  disclosureRequired,
  viewportId,
  onToggleExpanded,
  onOpen,
  onPeek,
  onToggleViewed,
  onAfterMutation,
}: SavedPostsListProps): React.ReactElement {
  if (loading && posts.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (error && posts.length === 0) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved posts yet.</p>;
  }

  const visiblePosts = expanded ? posts : posts.slice(0, visiblePostLimit);
  const renderPostList = (postsToRender: SavedPost[]): React.ReactElement => (
    <div
      className={
        columnCount === 2
          ? "grid h-full min-h-0 grid-cols-2 auto-rows-fr gap-x-4 gap-y-3"
          : cardConfig.size === "small"
            ? "grid h-full min-h-0 grid-cols-1 auto-rows-fr gap-y-1"
            : cardConfig.cardDensity === "compact"
              ? "space-y-1"
              : "grid h-full min-h-0 grid-cols-1 auto-rows-fr gap-y-3"
      }
    >
      {postsToRender.map((post) => (
        <SavedPostCard
          key={post.post_id}
          post={post}
          allTags={allTags}
          config={cardConfig}
          onOpen={onOpen}
          onPeek={onPeek}
          onToggleViewed={onToggleViewed}
          onAfterMutation={onAfterMutation}
        />
      ))}
    </div>
  );

  let visibleContent: React.ReactNode;
  if (groupedPosts) {
    const visiblePostIds = new Set(visiblePosts.map((post) => post.post_id));
    visibleContent = (
      <div className="space-y-4">
        {groupedPosts.map(({ source, posts: groupPosts }) => {
          const visibleGroup = groupPosts.filter((post) =>
            visiblePostIds.has(post.post_id),
          );
          if (visibleGroup.length === 0) return null;
          return (
            <div key={source}>
              {showGroupHeaders && (
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {SAVED_POST_SOURCE_LABELS[source]}
                </h4>
              )}
              {renderPostList(visibleGroup)}
            </div>
          );
        })}
      </div>
    );
  } else {
    visibleContent = renderPostList(visiblePosts);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {disclosureRequired && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-1 h-7 shrink-0 self-start px-2 text-xs"
          aria-expanded={expanded}
          aria-controls={viewportId}
          onClick={onToggleExpanded}
        >
          {expanded ? "Show fewer posts" : `Show all ${posts.length} posts`}
        </Button>
      )}
      <div
        id={viewportId}
        className={
          expanded && disclosureRequired
            ? "min-h-0 flex-1 overflow-y-auto overscroll-contain"
            : "min-h-0 flex-1"
        }
      >
        {visibleContent}
      </div>
    </div>
  );
}
