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
      className="mb-2 flex items-center gap-2 text-xs"
      role={error ? "alert" : "status"}
    >
      {error ? (
        <>
          <span className="text-destructive">
            {hasSnapshot
              ? "Weather data may be stale"
              : "Could not load weather data"}
            : {error}
          </span>
          <button
            type="button"
            className="underline"
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
