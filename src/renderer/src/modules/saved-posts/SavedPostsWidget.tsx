import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSavedPosts } from "../../hooks/useSavedPosts";
import {
  useSavedPostsConfig,
  DEFAULT_SAVED_POSTS_VIEW_CONFIG,
} from "../../hooks/useSavedPostsConfig";
import { useNtfyStaleness } from "../../hooks/useNtfyStaleness";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { SavedPostsSettingsPanel } from "./SavedPostsSettingsPanel";
import { SavedPostsList } from "./SavedPostsList";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Bookmark,
  Settings2,
  RotateCcw,
  RefreshCcw,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { toRedditPostUrl } from "../../lib/utils";
import { registerRendererModule } from "../registry";
import {
  IPC,
  type SavedPost,
  type LinkSource,
  type SavedPostsViewConfig,
} from "../../../../shared/ipc-types";
import { NtfyOnboardingWizard } from "./NtfyOnboardingWizard";
import { AddSavedPostModal } from "./AddSavedPostModal";
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { getSavedPostsContentPolicy } from "./saved-posts-content-policy";

function SavedPostsWidget(): React.ReactElement {
  const instance = useWidgetInstance();
  const widgetTitle = instance.label ?? "Saved Posts";
  const { config, setConfig } = useSavedPostsConfig(instance.instanceId);
  const staleness = useNtfyStaleness();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [snapshotConfig, setSnapshotConfig] =
    useState<SavedPostsViewConfig | null>(null);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const measurementRef = useRef<HTMLDivElement | null>(null);
  const measuredRowCountRef = useRef<number | null>(null);
  const previousSizeRef = useRef(instance.size);
  useEffect(() => {
    if (previousSizeRef.current === instance.size) return;
    previousSizeRef.current = instance.size;
    if (isEditing) {
      setEditContentHeight(null);
      measuredRowCountRef.current = null;
    }
  }, [instance.size, isEditing]);

  // Fetch posts with the widget's configured filters
  const { posts, loading, error, refetch } = useSavedPosts({
    limit: config.max_posts,
    offset: 0,
    subreddit_filter: config.subreddit_filter,
    tag_filter: config.tag_filter,
    source_filter: config.source_filter,
    hide_viewed: config.hideViewed,
    sort_by: config.sort_by,
    sort_dir: config.sort_dir,
  });

  // Derive available options for the controls
  const [allTags, setAllTags] = useState<string[]>([]);
  const availableSubreddits = useMemo(() => {
    const subs = new Set<string>();
    posts.forEach((p) => {
      if (p.subreddit) subs.add(p.subreddit);
    });
    return Array.from(subs).sort();
  }, [posts]);

  useEffect(() => {
    window.api
      .invoke(IPC.REDDIT_GET_ALL_TAGS)
      .then((result) => setAllTags(result as string[]))
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load tags for Saved Posts widget.",
        );
      });
  }, [posts]);

  // Listen for ntfy ingest complete push events
  useEffect(() => {
    const listener = (): void => {
      void refetch();
    };
    return window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener);
  }, [refetch]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);

  // Group posts by source when configured
  const groupedPosts = useMemo(() => {
    if (config.group_by !== "source") return null;
    const groups = new Map<LinkSource, SavedPost[]>();
    for (const post of posts) {
      const existing = groups.get(post.source);
      if (existing) {
        existing.push(post);
      } else {
        groups.set(post.source, [post]);
      }
    }
    // Return groups in configured sourceOrder, skip empty groups
    return config.sourceOrder
      .filter((source) => groups.has(source))
      .map((source) => ({ source, posts: groups.get(source)! }));
  }, [posts, config.group_by, config.sourceOrder]);

  const renderedRowCount = useMemo(() => {
    if (loading || posts.length === 0) return 0;
    const headerRows =
      groupedPosts && config.showGroupHeaders ? groupedPosts.length : 0;
    return posts.length + headerRows;
  }, [loading, posts.length, groupedPosts, config.showGroupHeaders]);

  useEffect(() => {
    if (!isEditing || loading) return;
    if (measuredRowCountRef.current === renderedRowCount) return;

    const measurementNode = measurementRef.current;
    const cardContent = cardContentRef.current;
    if (!measurementNode || !cardContent) return;

    const frame = window.requestAnimationFrame(() => {
      const styles = window.getComputedStyle(cardContent);
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const nextHeight = Math.ceil(
        measurementNode.scrollHeight + paddingTop + paddingBottom,
      );
      if (nextHeight > 0) {
        setEditContentHeight(nextHeight);
        measuredRowCountRef.current = renderedRowCount;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isEditing, loading, renderedRowCount]);

  const handleAfterMutation = useCallback(async (): Promise<void> => {}, []);

  if (
    !staleness.loading &&
    !staleness.topicConfigured &&
    !loading &&
    posts.length === 0 &&
    !error
  ) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            {widgetTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Set up mobile saving to get started.
          </p>
          <Button size="sm" onClick={() => setShowOnboarding(true)}>
            Set Up
          </Button>
          <NtfyOnboardingWizard
            isOpen={showOnboarding}
            onClose={() => setShowOnboarding(false)}
            onComplete={() => {
              setShowOnboarding(false);
              staleness.refetch();
              void refetch();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  const handleOpenExternal = (post: SavedPost): void => {
    if (post.viewed_at === null) {
      window.api
        .invoke(IPC.REDDIT_SET_SAVED_POST_VIEWED, post.post_id, true)
        .catch((err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to update viewed state.",
          );
        });
    }
    const url =
      post.source === "reddit" ? toRedditPostUrl(post.permalink) : post.url;
    window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, url).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to open saved post link.",
      );
    });
  };

  const handlePeekExternal = (post: SavedPost): void => {
    const url =
      post.source === "reddit" ? toRedditPostUrl(post.permalink) : post.url;
    window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, url).catch((err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to open saved post link.",
      );
    });
  };

  const handleToggleViewed = (post: SavedPost, viewed: boolean): void => {
    window.api
      .invoke(IPC.REDDIT_SET_SAVED_POST_VIEWED, post.post_id, viewed)
      .then((result) => {
        const payload = result as { ok: boolean; error: string | null };
        if (!payload.ok) {
          toast.error(payload.error ?? "Failed to update viewed state.");
          return;
        }
      })
      .catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Failed to update viewed state.",
        );
      });
  };

  function handleOpenEdit(): void {
    const currentHeight =
      cardContentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight);
    }
    measuredRowCountRef.current = renderedRowCount;
    setSnapshotConfig(config);
    setIsEditing(true);
  }

  function handleClose(): void {
    setIsEditing(false);
    setSnapshotConfig(null);
    setEditContentHeight(null);
    measuredRowCountRef.current = null;
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig);
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_SAVED_POSTS_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_SAVED_POSTS_VIEW_CONFIG);
  }

  const cardConfig = {
    showMetadata: config.showMetadata,
    showSourceBadge: config.showSourceBadge,
    showUrl: config.showUrl,
    showBodyPreview: config.showBodyPreview,
    cardDensity: config.cardDensity,
    size: instance.size,
  };

  const contentPolicy = getSavedPostsContentPolicy({
    size: instance.size,
    configuredMaxPosts: config.max_posts,
    fetchedPostCount: posts.length,
    expanded: isExpanded,
  });

  const effectiveCardConfig = {
    ...cardConfig,
    showMetadata: config.showMetadata && contentPolicy.showMetadata,
    showBodyPreview: config.showBodyPreview && contentPolicy.showBodyPreview,
    cardDensity: contentPolicy.effectiveCardDensity,
  };
  const postsViewportId = `saved-posts-posts-${instance.instanceId}`;
  const savedPostsList = (
    <SavedPostsList
      posts={posts}
      loading={loading}
      error={error}
      allTags={allTags}
      cardConfig={effectiveCardConfig}
      groupedPosts={groupedPosts}
      showGroupHeaders={config.showGroupHeaders}
      columnCount={contentPolicy.columnCount}
      expanded={isExpanded}
      visiblePostLimit={contentPolicy.visiblePostLimit}
      disclosureRequired={contentPolicy.disclosureRequired}
      viewportId={postsViewportId}
      onToggleExpanded={() => setIsExpanded((expanded) => !expanded)}
      onOpen={handleOpenExternal}
      onPeek={handlePeekExternal}
      onToggleViewed={handleToggleViewed}
      onAfterMutation={handleAfterMutation}
    />
  );

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="shrink-0 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bookmark className="h-5 w-5" />
            {widgetTitle}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="h-6 px-2 py-0 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Add Post
            </Button>
            {config.showViewAllLink && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate("/saved-posts")}
                className="h-6 px-2 py-0 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                View All
              </Button>
            )}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleReset}
                  title="Reset to when you opened this"
                  aria-label="Reset settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Restore defaults"
                      aria-label="Restore default settings"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset all Saved Posts widget settings to their defaults?
                        This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFactoryReset}>
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleClose}
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Saved posts widget settings"
                onClick={handleOpenEdit}
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        className="relative flex min-h-0 flex-1 flex-col"
        style={
          isEditing
            ? editContentHeight
              ? { height: editContentHeight, overflow: "hidden" }
              : undefined
            : { overflowY: contentPolicy.viewportOverflow }
        }
      >
        {isEditing && (
          <div
            ref={measurementRef}
            aria-hidden="true"
            className="absolute left-0 top-0 w-full invisible pointer-events-none"
          >
            {savedPostsList}
          </div>
        )}
        <div
          className={
            isEditing
              ? "saved-posts-card-edit"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          <div
            className={
              isEditing ? "saved-posts-card-edit__preview" : "min-h-0 flex-1"
            }
          >
            {savedPostsList}
          </div>
          {isEditing && (
            <div className="saved-posts-card-edit__panel">
              <SavedPostsSettingsPanel
                config={config}
                availableSubreddits={availableSubreddits}
                availableTags={allTags}
                onChange={setConfig}
                sizeControl={
                  <WidgetSizeControl
                    size={instance.size}
                    editMode={instance.editMode}
                    onChange={instance.onSizeChange}
                  />
                }
              />
            </div>
          )}
        </div>
      </CardContent>
      <AddSavedPostModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSaved={() => {
          void refetch();
        }}
      />
      <NtfyOnboardingWizard
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={() => {
          setShowOnboarding(false);
          staleness.refetch();
          void refetch();
        }}
      />
    </Card>
  );
}

// Register widget in renderer module registry
registerRendererModule({
  id: "saved_posts",
  displayName: "Saved Posts",
  widget: SavedPostsWidget,
});

export default SavedPostsWidget;
