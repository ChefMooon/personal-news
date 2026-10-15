import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRedditDigest } from "../../hooks/useRedditDigest";
import {
  DEFAULT_DIGEST_VIEW_CONFIG,
  useRedditDigestConfig,
} from "../../hooks/useRedditDigestConfig";
import { useRedditDigestWeeks } from "../../hooks/useRedditDigestWeeks";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { RedditDigestSettingsPanel } from "./RedditDigestSettingsPanel";
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { ScrollArea } from "../../components/ui/scroll-area";
import { SubredditColumn } from "./SubredditColumn";
import { useRedditDigestViewModel } from "./useRedditDigestViewModel";
import { getRedditDigestContentPolicy } from "./reddit-content-policy";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "../../components/ui/tabs";
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
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { formatRelativeTime } from "../../lib/time";
import { registerRendererModule } from "../registry";
import type { DigestViewConfig } from "../../../../shared/ipc-types";

function RedditDigestWidget(): React.ReactElement {
  const { instanceId, label, size, editMode, onSizeChange } =
    useWidgetInstance();
  const { config, setConfig } = useRedditDigestConfig(instanceId);
  const { weeks, loading: weeksLoading } = useRedditDigestWeeks();
  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] = useState<DigestViewConfig | null>(
    null,
  );
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const [smallGroupIndex, setSmallGroupIndex] = useState(0);
  const [columnGroupPage, setColumnGroupPage] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const previousSizeRef = useRef(size);
  const navigate = useNavigate();

  useEffect(() => {
    if (previousSizeRef.current === size) return;
    previousSizeRef.current = size;
    if (isEditing) setEditContentHeight(null);
  }, [isEditing, size]);

  useEffect(() => {
    const element = cardContentRef.current;
    if (!element) {
      return;
    }
    const updateWidth = (): void => {
      setContentWidth(element.getBoundingClientRect().width);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);

  const latestWeek = weeks[0]?.week_start_date ?? null;
  const selectedSpecificWeek = config.selected_week ?? latestWeek;
  const requestWeek =
    config.week_mode === "latest"
      ? latestWeek
      : config.week_mode === "specific"
        ? selectedSpecificWeek
        : null;
  const { posts, loading, refreshing, error, retry } = useRedditDigest(
    requestWeek,
    config.hide_viewed,
  );

  const {
    visiblePosts,
    availableSubreddits,
    sortedPosts,
    groups,
    lastFetched,
    groupKeys,
  } = useRedditDigestViewModel({ posts, weeks, config });
  const contentPolicy = getRedditDigestContentPolicy(
    size,
    contentWidth,
    config,
    groupKeys.length,
    groupKeys.some(
      (key) => (groups.get(key)?.length ?? 0) > config.max_posts_per_group,
    ),
  );
  useEffect(() => {
    setSmallGroupIndex((index) =>
      groupKeys.length === 0 ? 0 : Math.min(index, groupKeys.length - 1),
    );
  }, [groupKeys]);

  const columnCount = Math.max(1, contentPolicy.columnCount);
  const columnPageCount = Math.ceil(groupKeys.length / columnCount);
  const groupKeySignature = JSON.stringify(groupKeys);
  useEffect(() => {
    setColumnGroupPage(0);
  }, [groupKeySignature]);
  useEffect(() => {
    setColumnGroupPage((page) =>
      columnPageCount === 0 ? 0 : Math.min(page, columnPageCount - 1),
    );
  }, [columnPageCount]);

  const displayGroupKeys =
    size === "small"
      ? groupKeys.length > 0
        ? [groupKeys[smallGroupIndex]]
        : []
      : contentPolicy.effectiveMode === "columns"
        ? groupKeys.slice(
            columnGroupPage * columnCount,
            (columnGroupPage + 1) * columnCount,
          )
        : groupKeys;
  const widgetTitle = label ?? "Reddit Digest";
  const effectiveLoading = loading || weeksLoading;

  const weekSummaryText =
    config.week_mode === "range"
      ? `Showing last ${config.week_range_count} weeks`
      : requestWeek
        ? `Week of ${requestWeek}`
        : null;

  function handleOpenEdit(): void {
    const currentHeight =
      cardContentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight);
    }
    setSnapshotConfig(config);
    setIsEditing(true);
  }

  function handleClose(): void {
    setIsEditing(false);
    setSnapshotConfig(null);
    setEditContentHeight(null);
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig);
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_DIGEST_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_DIGEST_VIEW_CONFIG);
  }

  const hasSmallGroupNavigation = size === "small" && groupKeys.length > 0;
  const smallSubredditSelector = hasSmallGroupNavigation ? (
    <div className="mb-2 flex min-w-0 items-center gap-1 border-b pb-2">
      <ScrollArea orientation="horizontal" className="min-w-0 flex-1">
        <div className="flex w-max gap-1">
          {groupKeys.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => setSmallGroupIndex(index)}
              className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                index === smallGroupIndex
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              aria-current={index === smallGroupIndex ? "page" : undefined}
            >
              {key === "All" ? key : `r/${key}`}
            </button>
          ))}
        </div>
      </ScrollArea>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {smallGroupIndex + 1}/{groupKeys.length}
      </span>
    </div>
  ) : null;

  const columnGroupNavigation =
    contentPolicy.effectiveMode === "columns" && columnPageCount > 1 ? (
      <div className="mb-2 flex items-center justify-between gap-2 border-b pb-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          aria-label="Previous subreddit groups"
          disabled={columnGroupPage === 0}
          onClick={() => setColumnGroupPage((page) => Math.max(0, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span
          className="text-xs tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          {columnGroupPage * columnCount + 1}–
          {Math.min((columnGroupPage + 1) * columnCount, groupKeys.length)} of{" "}
          {groupKeys.length} groups
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2"
          aria-label="Next subreddit groups"
          disabled={columnGroupPage >= columnPageCount - 1}
          onClick={() =>
            setColumnGroupPage((page) =>
              Math.min(columnPageCount - 1, page + 1),
            )
          }
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    ) : null;

  const digestContent = effectiveLoading ? (
    <p className="text-sm text-muted-foreground">Loading posts...</p>
  ) : visiblePosts.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      No digest posts yet. Run the Reddit Digest script to populate.
    </p>
  ) : sortedPosts.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      No posts match the current filter.
    </p>
  ) : contentPolicy.effectiveMode === "columns" ? (
    <>
      {columnGroupNavigation}
      <div
        className="grid min-w-0 gap-4"
        style={{
          gridTemplateColumns: `repeat(${contentPolicy.columnCount}, minmax(0, 1fr))`,
        }}
      >
        {displayGroupKeys.map((key) => (
          <SubredditColumn
            key={key}
            label={key}
            posts={groups.get(key) ?? []}
            maxPosts={contentPolicy.postsPerGroupLimit}
            showPagination={size === "large"}
          />
        ))}
      </div>
    </>
  ) : size === "small" ? (
    <div className="min-w-0">
      {smallSubredditSelector}
      <SubredditColumn
        label={displayGroupKeys[0] ?? "All"}
        posts={groups.get(displayGroupKeys[0]) ?? []}
        maxPosts={contentPolicy.postsPerGroupLimit}
        showLabel={false}
        showPagination
      />
    </div>
  ) : (
    <Tabs defaultValue={displayGroupKeys[0]}>
      <TabsList className="mb-2 flex-wrap h-auto">
        {displayGroupKeys.map((key) => (
          <TabsTrigger key={key} value={key} className="text-xs">
            {key === "All" ? "All" : `r/${key}`}
          </TabsTrigger>
        ))}
      </TabsList>
      {displayGroupKeys.map((key) => (
        <TabsContent key={key} value={key}>
          <SubredditColumn
            label={key}
            posts={groups.get(key) ?? []}
            maxPosts={contentPolicy.postsPerGroupLimit}
          />
        </TabsContent>
      ))}
    </Tabs>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">{widgetTitle}</CardTitle>
            {lastFetched && (
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(lastFetched)}
              </span>
            )}
            {weekSummaryText && (
              <span className="text-xs text-muted-foreground">
                {weekSummaryText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/reddit-digest")}
              className="h-6 px-2 py-0 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              View All
            </Button>
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
                        Reset all Reddit Digest widget settings to their
                        defaults? This cannot be undone.
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
                aria-label="Reddit Digest widget settings"
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
        style={{
          ...(isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : { overflowY: contentPolicy.overflow }),
        }}
      >
        {error && (
          <div
            className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
            role="alert"
          >
            <span className="flex min-w-0 items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2"
              onClick={retry}
            >
              Retry
            </Button>
          </div>
        )}
        {refreshing && !effectiveLoading && (
          <p className="mb-2 text-xs text-muted-foreground" role="status">
            Refreshing posts…
          </p>
        )}
        <div className={isEditing ? "reddit-digest-card-edit" : undefined}>
          <div
            className={
              isEditing ? "reddit-digest-card-edit__preview" : undefined
            }
          >
            {digestContent}
          </div>
          {isEditing && (
            <div className="reddit-digest-card-edit__panel">
              <RedditDigestSettingsPanel
                config={config}
                availableSubreddits={availableSubreddits}
                availableWeeks={weeks}
                onChange={setConfig}
                sizeControl={
                  <WidgetSizeControl
                    size={size}
                    editMode={editMode}
                    onChange={onSizeChange}
                  />
                }
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Register widget in renderer module registry
registerRendererModule({
  id: "reddit_digest",
  displayName: "Reddit Digest",
  widget: RedditDigestWidget,
});

export default RedditDigestWidget;
