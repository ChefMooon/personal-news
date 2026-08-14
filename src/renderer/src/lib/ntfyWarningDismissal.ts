import type { NtfyStaleness, NtfySyncSummary } from "../../../shared/ipc-types";

const NTFY_WARNING_DISMISSAL_STORAGE_KEY = "saved-posts.ntfy-warning-dismissal";

interface WarningDismissalContext {
  isStale: boolean;
  lastPolledAt: number | null;
  summary: NtfySyncSummary | null;
}

export function buildNtfyWarningDismissalKey(
  context: WarningDismissalContext,
): string | null {
  const hasFailures = Boolean(context.summary?.hasFailures);
  const duplicateCount = context.summary?.duplicateCount ?? 0;

  if (!context.isStale && !hasFailures && duplicateCount === 0) {
    return null;
  }

  const summaryKey = context.summary
    ? JSON.stringify({
        hasFailures,
        failedCount: context.summary.failedCount ?? 0,
        duplicateCount,
        failedUrls: context.summary.failedUrls ?? [],
      })
    : "none";

  return `${context.isStale ? "stale" : "active"}:${context.lastPolledAt ?? "never"}:${summaryKey}`;
}

export function getDismissedNtfyWarningKey(
  storage: Storage | null | undefined,
): string | null {
  if (!storage) {
    return null;
  }

  return storage.getItem(NTFY_WARNING_DISMISSAL_STORAGE_KEY);
}

export function setDismissedNtfyWarningKey(
  key: string | null,
  storage: Storage | null | undefined,
): void {
  if (!storage) {
    return;
  }

  if (!key) {
    storage.removeItem(NTFY_WARNING_DISMISSAL_STORAGE_KEY);
    return;
  }

  storage.setItem(NTFY_WARNING_DISMISSAL_STORAGE_KEY, key);
}

export function shouldShowNtfyWarning({
  currentWarningKey,
  dismissalKey,
}: {
  currentWarningKey: string | null;
  dismissalKey: string | null;
}): boolean {
  return currentWarningKey !== null && dismissalKey !== currentWarningKey;
}

export function getNtfyWarningVisibilityState(
  staleness: Pick<NtfyStaleness, "isStale" | "lastPolledAt" | "summary">,
  storage: Storage | null | undefined,
): {
  warningKey: string | null;
  dismissedKey: string | null;
  shouldShow: boolean;
} {
  const warningKey = buildNtfyWarningDismissalKey({
    isStale: staleness.isStale,
    lastPolledAt: staleness.lastPolledAt,
    summary: staleness.summary,
  });
  const dismissedKey = getDismissedNtfyWarningKey(storage);

  return {
    warningKey,
    dismissedKey,
    shouldShow: shouldShowNtfyWarning({
      currentWarningKey: warningKey,
      dismissalKey: dismissedKey,
    }),
  };
}
