import type { NtfySyncSummary } from "../../../shared/ipc-types";

export interface NtfyFailureToastContent {
  title: string;
  description: string;
}

export function buildNtfyFailureToastContent(
  summary: NtfySyncSummary | null | undefined,
): NtfyFailureToastContent | null {
  if (!summary?.hasFailures || summary.failedUrls.length === 0) {
    return null;
  }

  const failedUrls = summary.failedUrls.slice(0, 3);
  const suffix = summary.failedUrls.length > failedUrls.length ? "…" : "";
  const description = `The following URLs could not be ingested: ${failedUrls.join(", ")}${suffix}`;

  return {
    title: "Some URLs could not be ingested",
    description,
  };
}
