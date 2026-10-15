import { useState, useEffect, useCallback, useRef } from "react";
import {
  IPC,
  type DigestPost,
  type DigestViewedChangedEvent,
} from "../../../shared/ipc-types";

export function useRedditDigest(
  weekStartDate?: string | null,
  hideViewed = false,
): {
  posts: DigestPost[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retry: () => void;
} {
  const [posts, setPosts] = useState<DigestPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const queryKey = `${weekStartDate ?? "all"}:${hideViewed ? "hidden" : "all"}`;
  const loadedQueryRef = useRef<string | null>(null);

  const fetchPosts = useCallback(
    (options?: { silent?: boolean }): void => {
      const silent = options?.silent ?? false;
      const sameQuery = loadedQueryRef.current === queryKey;
      const requestId = ++requestIdRef.current;
      if (silent && sameQuery) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
        if (!sameQuery) setPosts([]);
      }

      window.api
        .invoke(
          IPC.REDDIT_GET_DIGEST_POSTS,
          weekStartDate || hideViewed
            ? { week_start_date: weekStartDate, hide_viewed: hideViewed }
            : undefined,
        )
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setPosts(data as DigestPost[]);
          loadedQueryRef.current = queryKey;
          setError(null);
        })
        .catch((err) => {
          if (requestId !== requestIdRef.current) return;
          loadedQueryRef.current = queryKey;
          if (!sameQuery) setPosts([]);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Reddit Digest posts.",
          );
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
        });
    },
    [hideViewed, queryKey, weekStartDate],
  );

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    const unsubscribe = window.api.on(IPC.REDDIT_UPDATED, () => {
      fetchPosts({ silent: true });
    });
    return unsubscribe;
  }, [fetchPosts]);

  useEffect(() => {
    const unsubscribe = window.api.on(
      IPC.REDDIT_DIGEST_VIEWED_CHANGED,
      (...args: unknown[]) => {
        const event = args[0] as DigestViewedChangedEvent;
        setPosts((prev) => {
          const next = prev
            .map((post) =>
              post.post_id === event.post_id &&
              post.week_start_date === event.week_start_date
                ? { ...post, viewed_at: event.viewed_at }
                : post,
            )
            .filter((post) => !(hideViewed && post.viewed_at !== null));
          return next;
        });

        // If hide-viewed is enabled and an item is marked unviewed in another surface,
        // perform a silent refetch to bring it back into this list.
        if (hideViewed && event.viewed_at === null) {
          fetchPosts({ silent: true });
        }
      },
    );

    return unsubscribe;
  }, [fetchPosts, hideViewed]);

  const queryIsLoaded = loadedQueryRef.current === queryKey;
  return {
    posts: queryIsLoaded ? posts : [],
    loading: loading || !queryIsLoaded,
    refreshing: queryIsLoaded && refreshing,
    error: queryIsLoaded ? error : null,
    retry: () => fetchPosts({ silent: true }),
  };
}
