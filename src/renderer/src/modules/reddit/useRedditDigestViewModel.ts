import { useMemo } from "react";
import type {
  DigestPost,
  DigestViewConfig,
  DigestWeekSummary,
} from "../../../../shared/ipc-types";

interface UseRedditDigestViewModelOptions {
  posts: DigestPost[];
  weeks: DigestWeekSummary[];
  config: DigestViewConfig;
}

export function useRedditDigestViewModel({
  posts,
  weeks,
  config,
}: UseRedditDigestViewModelOptions) {
  const rangeWeekSet = useMemo(() => {
    if (config.week_mode !== "range") {
      return null;
    }
    return new Set(
      weeks
        .slice(0, config.week_range_count)
        .map((week) => week.week_start_date),
    );
  }, [config.week_mode, config.week_range_count, weeks]);

  const visiblePosts = useMemo(() => {
    if (config.week_mode !== "range" || !rangeWeekSet) {
      return posts;
    }
    return posts.filter((post) => rangeWeekSet.has(post.week_start_date));
  }, [config.week_mode, posts, rangeWeekSet]);

  const availableSubreddits = useMemo(
    () => [...new Set(visiblePosts.map((post) => post.subreddit))].sort(),
    [visiblePosts],
  );

  const selectedSubreddits = useMemo(
    () =>
      config.selected_subreddits.filter((subreddit) =>
        availableSubreddits.includes(subreddit),
      ),
    [availableSubreddits, config.selected_subreddits],
  );

  const orderedSubreddits = useMemo(() => {
    const availableMap = new Map(
      availableSubreddits.map((subreddit) => [subreddit, subreddit]),
    );
    const inOrder = config.subreddit_order
      .map((subreddit) => availableMap.get(subreddit))
      .filter((subreddit): subreddit is string => subreddit !== undefined);
    const seen = new Set(inOrder);
    const rest = availableSubreddits.filter(
      (subreddit) => !seen.has(subreddit),
    );
    const ordered = [...inOrder, ...rest];

    if (config.pinned_subreddits.length === 0) {
      return ordered;
    }

    const pinned = new Set(config.pinned_subreddits);
    const pinnedItems = ordered.filter((subreddit) => pinned.has(subreddit));
    const unpinnedItems = ordered.filter((subreddit) => !pinned.has(subreddit));
    return [...pinnedItems, ...unpinnedItems];
  }, [availableSubreddits, config.pinned_subreddits, config.subreddit_order]);

  const filteredPosts = useMemo(
    () =>
      config.subreddit_mode === "selected"
        ? visiblePosts.filter((post) =>
            selectedSubreddits.includes(post.subreddit),
          )
        : visiblePosts,
    [config.subreddit_mode, selectedSubreddits, visiblePosts],
  );

  const sortedPosts = useMemo(
    () =>
      [...filteredPosts].sort((a, b) => {
        const aVal = a[config.sort_by] ?? 0;
        const bVal = b[config.sort_by] ?? 0;
        return config.sort_dir === "desc"
          ? (bVal as number) - (aVal as number)
          : (aVal as number) - (bVal as number);
      }),
    [filteredPosts, config.sort_by, config.sort_dir],
  );

  const groups = useMemo((): Map<string, DigestPost[]> => {
    const map = new Map<string, DigestPost[]>();
    if (config.group_by === "subreddit") {
      for (const post of sortedPosts) {
        const existing = map.get(post.subreddit) ?? [];
        existing.push(post);
        map.set(post.subreddit, existing);
      }
    } else {
      map.set("All", sortedPosts);
    }
    return map;
  }, [sortedPosts, config.group_by]);

  const lastFetched =
    visiblePosts.length > 0
      ? Math.max(...visiblePosts.map((post) => post.fetched_at))
      : null;

  const groupKeys = useMemo(() => {
    if (config.group_by !== "subreddit") {
      return Array.from(groups.keys());
    }

    const orderedKeys = orderedSubreddits.filter((subreddit) =>
      groups.has(subreddit),
    );
    const orderedKeySet = new Set(orderedKeys);
    const remainingKeys = Array.from(groups.keys()).filter(
      (subreddit) => !orderedKeySet.has(subreddit),
    );
    return [...orderedKeys, ...remainingKeys];
  }, [config.group_by, groups, orderedSubreddits]);

  return {
    rangeWeekSet,
    visiblePosts,
    availableSubreddits,
    selectedSubreddits,
    orderedSubreddits,
    filteredPosts,
    sortedPosts,
    groups,
    lastFetched,
    groupKeys,
  };
}
