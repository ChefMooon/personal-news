import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { YtVideo } from "../../../../shared/ipc-types";
import { formatFutureTime, formatRelativeTime } from "../../lib/time";
import { isActiveLivestream } from "./video-lifecycle";

const STREAMS_PER_PAGE = 2;

interface StreamPanelProps {
  streams: YtVideo[];
  compact?: boolean;
}

export function StreamPanel({
  streams,
  compact = false,
}: StreamPanelProps): React.ReactElement {
  const [, setTick] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const now = Math.floor(Date.now() / 1000);
  const upcomingStreams = [...streams]
    .filter((stream) => {
      if (!isActiveLivestream(stream)) {
        return false;
      }

      if (stream.broadcast_status === "live") {
        return true;
      }

      return stream.scheduled_start == null || stream.scheduled_start > now;
    })
    .sort((left, right) => {
      const leftPriority = left.broadcast_status === "live" ? 0 : 1;
      const rightPriority = right.broadcast_status === "live" ? 0 : 1;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftTime =
        left.broadcast_status === "live"
          ? (left.actual_start_time ??
            left.scheduled_start ??
            left.published_at)
          : (left.scheduled_start ?? left.published_at);
      const rightTime =
        right.broadcast_status === "live"
          ? (right.actual_start_time ??
            right.scheduled_start ??
            right.published_at)
          : (right.scheduled_start ?? right.published_at);

      return leftTime - rightTime;
    });
  const streamIdentitySignature = upcomingStreams
    .map((stream) => stream.video_id)
    .join("|");
  const totalPages = Math.max(
    1,
    Math.ceil(upcomingStreams.length / STREAMS_PER_PAGE),
  );
  const pagedStreams = upcomingStreams.slice(
    currentPage * STREAMS_PER_PAGE,
    (currentPage + 1) * STREAMS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [streamIdentitySignature]);

  const handlePreviousPage = (): void => {
    setCurrentPage((page) => Math.max(0, page - 1));
  };

  const handleNextPage = (): void => {
    setCurrentPage((page) => Math.min(totalPages - 1, page + 1));
  };

  return (
    <div
      className={
        compact
          ? "flex flex-col gap-1.5 w-[160px] shrink-0"
          : "flex flex-col gap-2 w-[200px] shrink-0"
      }
    >
      <div className="flex items-center justify-between gap-1">
        <h4 className="min-w-0 truncate whitespace-nowrap text-xs font-medium text-foreground">
          Upcoming Streams
        </h4>
        {totalPages > 1 ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <span
              className="rounded-sm bg-muted px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              title="Total upcoming streams"
            >
              {upcomingStreams.length}
            </span>
            <button
              type="button"
              onClick={handlePreviousPage}
              disabled={currentPage === 0}
              className="rounded p-0.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Previous upcoming streams page"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <span className="min-w-8 text-center tabular-nums text-[11px] font-medium text-foreground">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage === totalPages - 1}
              className="rounded p-0.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Next upcoming streams page"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
      {upcomingStreams.length === 0 ? (
        <p className="text-xs text-muted-foreground">No upcoming streams</p>
      ) : (
        <>
          <div className="flex flex-col rounded-md border border-border divide-y divide-border overflow-hidden bg-card">
            {pagedStreams.map((stream) => (
              <button
                key={stream.video_id}
                type="button"
                onClick={() => {
                  const url = `https://www.youtube.com/watch?v=${stream.video_id}`;
                  window.api.invoke("shell:openExternal", url).catch((err) => {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Failed to open stream.",
                    );
                  });
                }}
                className={
                  compact
                    ? "w-full text-left px-2 py-1.5 group cursor-pointer transition-colors hover:bg-accent/40"
                    : "w-full text-left px-3 py-2 group cursor-pointer transition-colors hover:bg-accent/40"
                }
              >
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium line-clamp-2 leading-tight text-card-foreground group-hover:text-primary transition-colors">
                    {stream.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {stream.broadcast_status === "live"
                      ? `Live now${stream.actual_start_time ? ` · started ${formatRelativeTime(stream.actual_start_time)}` : ""}`
                      : stream.scheduled_start
                        ? formatFutureTime(stream.scheduled_start)
                        : "Upcoming"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
