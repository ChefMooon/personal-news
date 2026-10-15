import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  IPC,
  type YtVideo,
  type YoutubeVideoWatchedChangedEvent,
} from "../../../shared/ipc-types";

export function useYouTubeVideos(channelId: string): {
  videos: YtVideo[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retry: () => void;
} {
  const [result, setResult] = useState<{
    channelId: string;
    videos: YtVideo[];
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errorState, setErrorState] = useState<{
    channelId: string;
    message: string;
  } | null>(null);
  const requestId = useRef(0);
  const resultRef = useRef(result);
  resultRef.current = result;
  const hasCurrentResult = result?.channelId === channelId;
  const videos = hasCurrentResult ? result.videos : [];
  const error = errorState?.channelId === channelId ? errorState.message : null;
  const loading = !hasCurrentResult && !error;

  const fetch = useCallback(() => {
    const id = ++requestId.current;
    const hasResult = resultRef.current?.channelId === channelId;
    setErrorState(null);
    setRefreshing(hasResult);
    window.api
      .invoke("youtube:getVideos", channelId)
      .then((data) => {
        if (id === requestId.current) {
          setResult({ channelId, videos: data as YtVideo[] });
        }
      })
      .catch((err) => {
        if (id === requestId.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load YouTube videos.";
          setErrorState({ channelId, message });
          toast.error(message);
        }
      })
      .finally(() => {
        if (id === requestId.current) setRefreshing(false);
      });
  }, [channelId]);

  useEffect(() => {
    fetch();

    const handler = (): void => {
      fetch();
    };

    return window.api.on(IPC.YOUTUBE_UPDATED, handler);
  }, [fetch]);

  useEffect(() => {
    const handler = (...args: unknown[]): void => {
      const event = args[0] as YoutubeVideoWatchedChangedEvent;
      setResult((prev) => {
        if (!prev || prev.channelId !== channelId) return prev;
        return {
          ...prev,
          videos: prev.videos.map((video) =>
            video.video_id === event.videoId
              ? { ...video, watched_at: event.watchedAt }
              : video,
          ),
        };
      });
    };

    return window.api.on(IPC.YOUTUBE_VIDEO_WATCHED_CHANGED, handler);
  }, [channelId]);

  return { videos, loading, refreshing, error, retry: fetch };
}
