import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { formatRelativeTime } from "../../lib/time";
import type { NtfySyncSummary } from "../../../../shared/ipc-types";

interface StaleWarningProps {
  lastPolledAt: number | null;
  isStale: boolean;
  summary: NtfySyncSummary | null;
  onDismiss: () => void;
  onSyncNow: () => Promise<void>;
  onOpenDetails?: () => void;
  loading?: boolean;
}

export function StaleWarning({
  lastPolledAt,
  isStale,
  summary,
  onDismiss,
  onSyncNow,
  onOpenDetails,
  loading,
}: StaleWarningProps): React.ReactElement | null {
  const hasFailures = Boolean(summary?.hasFailures);
  const duplicateCount = summary?.duplicateCount ?? 0;
  if (!isStale && !hasFailures && duplicateCount === 0) return null;

  const lastSyncText = lastPolledAt
    ? formatRelativeTime(lastPolledAt)
    : "never";

  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-600/50 bg-amber-600/10 dark:border-amber-400/50 dark:bg-amber-400/10 px-4 py-3 mb-4">
      <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0" />
      <div className="flex-1 text-sm">
        {hasFailures || duplicateCount > 0 ? (
          <div>
            <span className="font-medium text-amber-800 dark:text-amber-200">
              Last sync had {summary?.failedCount ?? 0} failed link
              {summary && summary.failedCount === 1 ? "" : "s"}
              {duplicateCount > 0
                ? ` and ${duplicateCount} duplicate skip${duplicateCount === 1 ? "" : "s"}`
                : ""}
              .
            </span>{" "}
            <button
              type="button"
              className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails?.();
              }}
            >
              View last sync details.
            </button>
          </div>
        ) : (
          <span className="font-medium text-amber-800 dark:text-amber-200">
            Last synced: {lastSyncText}.
          </span>
        )}
        {!hasFailures && (
          <span>
            {" "}
            Messages on ntfy.sh expire after 24 hours — some saved posts may
            have been lost.
          </span>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            void onSyncNow();
          }}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`}
          />
          Sync Now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
