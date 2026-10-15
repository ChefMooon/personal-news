import React from "react";
import { Badge } from "../../components/ui/badge";
import { ArrowUp, Clock } from "lucide-react";
import { formatRelativeTime } from "../../lib/time";
import { type SavedPost } from "../../../../shared/ipc-types";
import { SavedPostItemActions } from "./SavedPostItemActions";
import { SAVED_POST_SOURCE_LABELS } from "./saved-posts-constants";

export interface SavedPostCardConfig {
  showMetadata: boolean;
  showSourceBadge: boolean;
  showUrl: boolean;
  showBodyPreview: boolean;
  cardDensity: "compact" | "detailed";
  size: "small" | "medium" | "large";
}

export function formatAuthor(post: SavedPost): string | null {
  if (!post.author) return null;
  if (post.source === "reddit") return `u/${post.author}`;
  if (post.source === "x") return `@${post.author}`;
  return post.author;
}

interface SavedPostCardProps {
  post: SavedPost;
  allTags: string[];
  config: SavedPostCardConfig;
  onOpen: (post: SavedPost) => void;
  onPeek: (post: SavedPost) => void;
  onToggleViewed: (post: SavedPost, viewed: boolean) => void;
  onAfterMutation: () => Promise<void> | void;
}

export function SavedPostCard({
  post,
  allTags,
  config,
  onOpen,
  onPeek,
  onToggleViewed,
  onAfterMutation,
}: SavedPostCardProps): React.ReactElement {
  const author = formatAuthor(post);
  const isViewed = post.viewed_at !== null;
  const isSmall = config.size === "small";
  const isCompactMedium =
    config.size === "medium" && config.cardDensity === "compact";
  const isInlineCompact = isSmall || isCompactMedium;
  const cardPadding = isCompactMedium ? "py-0.5" : "py-1";

  return (
    <SavedPostItemActions
      post={post}
      allTags={allTags}
      onOpenPost={onOpen}
      onPeekPost={onPeek}
      onSetViewed={onToggleViewed}
      onAfterMutation={onAfterMutation}
    >
      {({ onContextMenu, trigger, peekButton, viewedToggle }) => (
        <div
          className={
            config.cardDensity === "compact"
              ? `flex h-full items-start gap-2 ${cardPadding} px-2 rounded bg-muted/30 w-full hover:bg-muted/50 transition-colors`
              : "flex h-full items-start gap-2 py-3 px-2 rounded bg-muted/30 w-full hover:bg-muted/50 transition-colors"
          }
          onContextMenu={onContextMenu}
        >
          <button
            type="button"
            onClick={() => onOpen(post)}
            className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
          >
            <div
              className={
                isInlineCompact
                  ? "flex min-w-0 items-center gap-1.5"
                  : "flex items-center gap-1.5 flex-wrap"
              }
            >
              {config.showSourceBadge && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {SAVED_POST_SOURCE_LABELS[post.source]}
                </Badge>
              )}
              {post.source === "reddit" &&
                post.subreddit &&
                config.showMetadata && (
                  <Badge variant="secondary" className="text-xs shrink-0">
                    r/{post.subreddit}
                  </Badge>
                )}
              {author && config.showMetadata && (
                <span className="text-xs text-muted-foreground">{author}</span>
              )}
              {isInlineCompact && (
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-medium ${isViewed ? "text-foreground/70" : ""}`}
                >
                  {post.title}
                </span>
              )}
            </div>
            {!isInlineCompact && (
              <div
                className={
                  config.cardDensity === "compact"
                    ? `text-sm font-medium line-clamp-2 flex-1 ${isViewed ? "text-foreground/70" : ""}`
                    : `text-sm font-medium ${isViewed ? "text-foreground/70" : ""}`
                }
              >
                {post.title}
              </div>
            )}
            {isInlineCompact ? (
              <p
                aria-hidden={!post.note}
                className="mt-0.5 min-h-4 text-xs leading-4 text-muted-foreground italic line-clamp-1"
              >
                {post.note ?? ""}
              </p>
            ) : (
              post.note && (
                <p className="mt-1 text-xs text-muted-foreground italic line-clamp-2">
                  {post.note}
                </p>
              )
            )}
            {config.showUrl && (
              <p className="text-xs text-muted-foreground truncate max-w-full">
                {post.url}
              </p>
            )}
            {config.showBodyPreview && post.body && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {post.body}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs">
              {post.score !== null && config.showMetadata && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-foreground/80 whitespace-nowrap">
                  <ArrowUp className="h-3 w-3" />
                  <span>{post.score.toLocaleString()}</span>
                </div>
              )}
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-foreground/80 whitespace-nowrap"
                title={new Date(post.saved_at * 1000).toLocaleString()}
              >
                <Clock className="h-3 w-3" />
                <span>{formatRelativeTime(post.saved_at)}</span>
              </div>
            </div>
          </button>
          <div className="mt-0.5 flex items-center gap-1 shrink-0">
            {viewedToggle}
            {peekButton}
            {trigger}
          </div>
        </div>
      )}
    </SavedPostItemActions>
  );
}
