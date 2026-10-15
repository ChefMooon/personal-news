import React from "react";

interface WeatherRefreshStatusProps {
  refreshing: boolean;
  error: string | null;
  hasSnapshot: boolean;
  onRetry: () => void | Promise<void>;
}

export function WeatherRefreshStatus({
  refreshing,
  error,
  hasSnapshot,
  onRetry,
}: WeatherRefreshStatusProps): React.ReactElement | null {
  if (!refreshing && !error) return null;

  return (
    <div
      className="flex max-w-48 min-w-0 items-center gap-2 text-[11px]"
      role={error ? "alert" : "status"}
    >
      {error ? (
        <>
          <span
            className="min-w-0 flex-1 truncate font-medium text-foreground"
            title={`${error}${hasSnapshot ? " Showing the last weather snapshot." : ""}`}
          >
            {hasSnapshot ? "Refresh failed" : "Weather unavailable"}
          </span>
          <button
            type="button"
            className="shrink-0 rounded underline focus-visible:outline focus-visible:outline-ring"
            disabled={refreshing}
            onClick={() => void onRetry()}
          >
            Retry
          </button>
        </>
      ) : (
        <span className="text-muted-foreground">Refreshing weather…</span>
      )}
    </div>
  );
}
