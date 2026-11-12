import type Database from "better-sqlite3";
import { BrowserWindow } from "electron";
import cron, { type ScheduledTask } from "node-cron";
import { IPC, type NtfyIngestCompleteEvent } from "../../../shared/ipc-types";
import type { DataSourceModule } from "../registry";
import { getSetting } from "../../settings/store";
import { isElectronHarnessRun } from "../../harness-mode";
import { isDevTestDataActive } from "../../dev-test-data";
import { isFeatureEnabled } from "../../features/feature-state";
import { pollNtfy } from "./ntfy";
import { notifySavedPostsSync } from "../../notifications/notification-service";

const DEFAULT_NTFY_POLL_INTERVAL_MINUTES = 60;

let dbRef: Database.Database | null = null;
let pollingInProgress = false;
let activePollIntervalMinutes = DEFAULT_NTFY_POLL_INTERVAL_MINUTES;
let pollTask: ScheduledTask | null = null;

function emitNtfyIngestComplete(
  postsIngested: number,
  error?: string,
  summary?: NtfyIngestCompleteEvent["summary"],
): void {
  const payload: NtfyIngestCompleteEvent = {
    postsIngested,
    error,
    summary,
  };

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_NTFY_INGEST_COMPLETE, payload);
  }
}

export async function triggerNtfyPoll(): Promise<{
  postsIngested: number;
  messagesReceived: number;
  linkOnlyCount: number;
}> {
  if (!isFeatureEnabled("saved_posts")) {
    throw new Error("Saved Posts is disabled.");
  }
  return runNtfyPoll({ throwOnError: true, trigger: "manual" });
}

function getCronExpression(minutes: number): string {
  return `*/${minutes} * * * *`;
}

function stopPollScheduler(): void {
  if (!pollTask) {
    return;
  }

  pollTask.stop();
  const taskWithDestroy = pollTask as ScheduledTask & { destroy?: () => void };
  if (typeof taskWithDestroy.destroy === "function") {
    taskWithDestroy.destroy();
  }
  pollTask = null;
}

function startPollScheduler(): void {
  if (!dbRef) {
    return;
  }

  stopPollScheduler();
  pollTask = cron.schedule(getCronExpression(activePollIntervalMinutes), () => {
    void runNtfyPoll({ throwOnError: false, trigger: "automatic" });
  });
}

export function applyNtfyPollInterval(minutes: number): void {
  activePollIntervalMinutes = minutes;
  if (!isFeatureEnabled("saved_posts")) {
    stopPollScheduler();
    return;
  }
  startPollScheduler();
}

function loadConfiguredPollInterval(): void {
  const configuredInterval = getSetting("ntfy_poll_interval_minutes");
  const parsedInterval = configuredInterval
    ? parseInt(configuredInterval, 10)
    : NaN;
  if (
    Number.isInteger(parsedInterval) &&
    parsedInterval >= 1 &&
    parsedInterval <= 1440
  ) {
    activePollIntervalMinutes = parsedInterval;
  } else {
    activePollIntervalMinutes = DEFAULT_NTFY_POLL_INTERVAL_MINUTES;
  }
}

async function runNtfyPoll(options: {
  throwOnError: boolean;
  trigger: "automatic" | "manual";
}): Promise<{ postsIngested: number; messagesReceived: number; linkOnlyCount: number }> {
  if (
    options.trigger === "automatic" &&
    !isFeatureEnabled("saved_posts")
  ) {
    return { postsIngested: 0, messagesReceived: 0, linkOnlyCount: 0 };
  }
  if (!dbRef) {
    throw new Error("Reddit module not initialized");
  }
  if (pollingInProgress) {
    return { postsIngested: 0, messagesReceived: 0, linkOnlyCount: 0 };
  }

  pollingInProgress = true;
  try {
    if (options.trigger === "automatic" && isDevTestDataActive(dbRef)) {
      return { postsIngested: 0, messagesReceived: 0, linkOnlyCount: 0 };
    }
    const result = await pollNtfy(dbRef, options.trigger);
    const summary = getSetting("ntfy_last_sync_summary");
    const parsedSummary = summary
      ? (JSON.parse(summary) as NtfyIngestCompleteEvent["summary"])
      : null;
    emitNtfyIngestComplete(result.postsIngested, undefined, parsedSummary);
    notifySavedPostsSync(result.postsIngested);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Reddit] ntfy poll failed:", msg);
    emitNtfyIngestComplete(0, msg, null);
    if (options.throwOnError) {
      throw error;
    }
    return { postsIngested: 0, messagesReceived: 0, linkOnlyCount: 0 };
  } finally {
    pollingInProgress = false;
  }
}

export function applySavedPostsEnabled(enabled: boolean): void {
  if (!enabled) {
    stopPollScheduler();
    return;
  }
  if (isElectronHarnessRun()) {
    return;
  }

  loadConfiguredPollInterval();
  startPollScheduler();
  if (getSetting("ntfy_topic")) {
    void pollNtfyStartup();
  }
}

export const RedditModule: DataSourceModule = {
  id: "reddit",
  displayName: "Reddit",
  initialize(db: Database.Database): void {
    dbRef = db;
    console.log("[Reddit] Module initialized");
    if (isElectronHarnessRun()) {
      console.log("[Reddit] Startup polling disabled in the Electron harness");
      return;
    }

    if (!isFeatureEnabled("saved_posts")) {
      console.log(
        "[Reddit] Saved Posts feature is disabled, skipping ntfy polling",
      );
      return;
    }

    loadConfiguredPollInterval();

    startPollScheduler();

    // Run startup poll
    void pollNtfyStartup();
  },
  shutdown(): void {
    console.log("[Reddit] Module shutdown");
    stopPollScheduler();
    dbRef = null;
  },
};

async function pollNtfyStartup(): Promise<void> {
  try {
    await runNtfyPoll({ throwOnError: false, trigger: "automatic" });
  } catch {
    // runNtfyPoll only throws when throwOnError is true.
  }
}
