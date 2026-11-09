import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type {
  IpcMutationResult,
  ReleaseNotesDocument,
  SimulateUpdateStatusRequest,
  UpdateStatusEvent,
} from "../../shared/ipc-types";
import { isElectronHarnessRun } from "../harness-mode";
import { parseUpdaterReleaseNotes } from "./release-notes";
import { getSetting } from "../settings/store";

const AUTO_UPDATE_CHECK_ENABLED_KEY = "app_auto_update_check_enabled";

function normalizeUpdaterErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (
    (normalized.includes("404") && normalized.includes("latest.yml")) ||
    (normalized.includes("404") && normalized.includes("/releases/latest")) ||
    normalized.includes("no published versions on github")
  ) {
    return "Unable to check for updates. No published release metadata was found (latest.yml). Publish a tagged GitHub Release to enable auto-updates.";
  }

  if (
    (normalized.includes("404") && normalized.includes("releases.atom")) ||
    (normalized.includes("authentication token") &&
      normalized.includes("404")) ||
    normalized.includes("private github")
  ) {
    return "Unable to check for updates. The GitHub release feed is private or unavailable.";
  }

  if (
    normalized.includes("enotfound") ||
    normalized.includes("econnrefused") ||
    normalized.includes("timed out") ||
    normalized.includes("etimedout") ||
    normalized.includes("network")
  ) {
    return "Unable to check for updates because the network request failed. Please try again.";
  }

  return "Unable to check for updates right now. Please try again later.";
}

let initialized = false;
let latestStatus: UpdateStatusEvent = {
  state: "idle",
  message: "Updater not initialized yet.",
  currentVersion: app.getVersion(),
  supported: process.platform === "win32",
  downloadedReady: false,
  operationOrigin: "automatic",
};

let simulatedDownload = false;

let statusListener: ((status: UpdateStatusEvent) => void) | null = null;

function normalizeReleaseNotes(input: unknown): ReleaseNotesDocument | null {
  return parseUpdaterReleaseNotes(input);
}

function emitStatus(
  partial: Omit<UpdateStatusEvent, "currentVersion" | "supported">,
): void {
  latestStatus = {
    ...latestStatus,
    ...partial,
    currentVersion: app.getVersion(),
    supported: process.platform === "win32",
  };

  if (partial.state !== "error" && !Object.hasOwn(partial, "friendlyMessage")) {
    delete latestStatus.friendlyMessage;
  }

  if (statusListener) {
    statusListener(latestStatus);
  }
}

function isWindowsAutoUpdateSupported(): boolean {
  return process.platform === "win32";
}

function hasPackagedUpdateContext(): boolean {
  return app.isPackaged;
}

function isAutoUpdateCheckEnabled(): boolean {
  const raw = getSetting(AUTO_UPDATE_CHECK_ENABLED_KEY);
  if (raw === null) {
    return true;
  }
  return raw === "1" || raw === "true";
}

export function setUpdateStatusListener(
  listener: ((status: UpdateStatusEvent) => void) | null,
): void {
  statusListener = listener;
  if (listener) {
    listener(latestStatus);
  }
}

export function getCurrentUpdateStatus(): UpdateStatusEvent {
  return latestStatus;
}

export async function initializeAutoUpdates(): Promise<void> {
  if (initialized) {
    return;
  }

  initialized = true;

  if (!isWindowsAutoUpdateSupported()) {
    emitStatus({
      state: "disabled",
      message: "Auto-update is currently enabled for Windows only.",
    });
    return;
  }

  if (!hasPackagedUpdateContext()) {
    emitStatus({
      state: "disabled",
      message: "Auto-update checks are disabled in development builds.",
    });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    emitStatus({ state: "checking", message: "Checking for updates...", operationOrigin: activeCheckOrigin, operationPhase: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    const keepDownloadedCandidate =
      latestStatus.downloadedReady && latestStatus.downloadedVersion === info.version;
    emitStatus({
      state: "available",
      message: `Update ${info.version} is available. Downloading in the background.`,
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      operationOrigin: activeCheckOrigin,
      operationPhase: "downloading",
      lastCheckAt: Date.now(),
      lastCheckResult: "available",
      lastCheckVersion: info.version,
      downloadedReady: keepDownloadedCandidate,
      ...(keepDownloadedCandidate
        ? {}
        : {
            downloadedVersion: undefined,
            downloadedReleaseDate: undefined,
            downloadedReleaseNotes: undefined,
          }),
    });
  });

  autoUpdater.on("update-not-available", () => {
    emitStatus({
      state: "not-available",
      message: "You are on the latest version.",
      operationOrigin: activeCheckOrigin,
      operationPhase: undefined,
      lastCheckAt: Date.now(),
      lastCheckResult: "not-available",
      lastCheckVersion: undefined,
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    emitStatus({
      state: "downloading",
      message: `Downloading update: ${Math.round(progress.percent)}%`,
      downloadPercent: progress.percent,
      operationPhase: "downloading",
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    simulatedDownload = false;
    emitStatus({
      state: "downloaded",
      message: `Update ${info.version} has been downloaded and is ready to install.`,
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      downloadedReady: true,
      ...(latestStatus.installRequested ? {} : { installRequested: false }),
      operationPhase: latestStatus.installRequested ? "install-requested" : "ready",
      downloadedVersion: info.version,
      downloadedReleaseDate: info.releaseDate,
      downloadedReleaseNotes: normalizeReleaseNotes(info.releaseNotes),
    });
  });

  autoUpdater.on("error", (error) => {
    const message = error?.message ?? "An unknown auto-update error occurred.";
    const failedDuring: NonNullable<UpdateStatusEvent["failedDuring"]> =
      latestStatus.state === "error"
        ? latestStatus.failedDuring ?? "checking"
        : latestStatus.operationPhase === "error" ||
            latestStatus.operationPhase === undefined
          ? "checking"
          : latestStatus.operationPhase;
    const friendlyMessage = failedDuring === "install-requested"
      ? installCallInProgress
        ? "The updater rejected the install request. The downloaded update remains ready; you can try again."
        : "The install request was accepted, but the updater reported an error. The app may remain open; restart it manually and check for updates again. This process will not send another install request."
      : failedDuring === "checking"
        ? normalizeUpdaterErrorMessage(message)
        : `The update operation failed: ${message}`;
    if (failedDuring === "checking" && checkRequestInFlight) {
      lastErrorEventDuringCheck = message;
    }
    if (failedDuring === "install-requested" && installCallInProgress) {
      synchronousInstallError = message;
    }
    emitStatus({
      state: "error",
      message,
      friendlyMessage,
      operationOrigin: activeCheckOrigin,
      operationPhase: "error",
      failedDuring,
      ...(failedDuring === "install-requested" && installCallInProgress
        ? { installRequested: false }
        : {}),
      ...(failedDuring === "checking"
        ? { lastCheckAt: Date.now(), lastCheckResult: "error", lastCheckVersion: undefined }
        : {}),
    });
  });

  if (!isAutoUpdateCheckEnabled()) {
    emitStatus({
      state: "disabled",
      message: "Automatic update checks are turned off in Settings.",
    });
    return;
  }

  await checkForAppUpdates();
}

let activeCheckOrigin: "manual" | "automatic" = "automatic";
let installRequestInFlight = false;
let checkRequestInFlight = false;
let lastErrorEventDuringCheck: string | null = null;
let installCallInProgress = false;
let synchronousInstallError: string | null = null;

export async function checkForAppUpdates(options?: {
  manual?: boolean;
}): Promise<IpcMutationResult> {
  if (!isWindowsAutoUpdateSupported()) {
    emitStatus({
      state: "disabled",
      message: "Auto-update checks are currently enabled for Windows only.",
    });
    return {
      ok: false,
      error: "Auto-update currently supports Windows builds only.",
    };
  }

  if (!hasPackagedUpdateContext()) {
    emitStatus({
      state: "disabled",
      message: "Auto-update checks are disabled in development builds.",
    });
    return {
      ok: false,
      error: "Auto-update checks are only available in packaged builds.",
    };
  }

  if (!options?.manual && !isAutoUpdateCheckEnabled()) {
    emitStatus({
      state: "disabled",
      message: "Automatic update checks are turned off in Settings.",
    });
    return { ok: true, error: null };
  }

  if (checkRequestInFlight) {
    return { ok: false, error: "An update check is already in progress." };
  }

  try {
    checkRequestInFlight = true;
    lastErrorEventDuringCheck = null;
    activeCheckOrigin = options?.manual ? "manual" : "automatic";
    await autoUpdater.checkForUpdates();
    return { ok: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check for updates.";
    const friendlyMessage = normalizeUpdaterErrorMessage(message);
    if (lastErrorEventDuringCheck !== message) {
      emitStatus({ state: "error", message, friendlyMessage, operationOrigin: activeCheckOrigin, operationPhase: "error", failedDuring: "checking", lastCheckAt: Date.now(), lastCheckResult: "error", lastCheckVersion: undefined });
    }
    return { ok: false, error: friendlyMessage };
  } finally {
    checkRequestInFlight = false;
    lastErrorEventDuringCheck = null;
  }
}

const SIMULATED_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const MAX_SIMULATED_RELEASE_NOTES_LENGTH = 100_000;

/** Harness-only: injects a fake downloaded update so the real toast and Settings paths can run. */
export function simulateDownloadedUpdateForHarness(
  request: SimulateUpdateStatusRequest,
): IpcMutationResult {
  if (!isElectronHarnessRun()) {
    return { ok: false, error: "Update simulation is only available in harness runs." };
  }
  const version = request?.version;
  const html = request?.releaseNotesHtml;
  if (typeof version !== "string" || !SIMULATED_VERSION_PATTERN.test(version)) {
    return { ok: false, error: "Invalid simulated update version." };
  }
  if (typeof html !== "string" || html.length > MAX_SIMULATED_RELEASE_NOTES_LENGTH) {
    return { ok: false, error: "Invalid simulated release notes." };
  }

  const notes = parseUpdaterReleaseNotes(html);
  simulatedDownload = true;
  emitStatus({
    state: "downloaded",
    message: `Update ${version} has been downloaded and is ready to install.`,
    version,
    releaseNotes: notes,
    downloadedReady: true,
    installRequested: false,
    operationPhase: "ready",
    downloadedVersion: version,
    downloadedReleaseNotes: notes,
  });
  return { ok: true, error: null };
}

export function installDownloadedUpdate(): IpcMutationResult {
  if (simulatedDownload) {
    return { ok: false, error: "Simulated update cannot be installed." };
  }

  if (!isWindowsAutoUpdateSupported()) {
    return {
      ok: false,
      error: "Install is only available on Windows right now.",
    };
  }

  if (!latestStatus.downloadedReady) {
    return { ok: false, error: "No downloaded update is ready to install." };
  }
  if (installRequestInFlight || latestStatus.installRequested) {
    return { ok: true, error: null };
  }
  try {
    installRequestInFlight = true;
    synchronousInstallError = null;
    emitStatus({
      state: latestStatus.state,
      message: "Sending install and restart request...",
      installRequested: true,
      operationPhase: "install-requested",
    });
    installCallInProgress = true;
    autoUpdater.quitAndInstall();
    installCallInProgress = false;
    if (synchronousInstallError) {
      installRequestInFlight = false;
      return { ok: false, error: latestStatus.friendlyMessage ?? synchronousInstallError };
    }
    emitStatus({ state: latestStatus.state, message: "Install and restart requested. If the app remains open, restart it manually and check for updates again.", installRequested: true, operationPhase: "install-requested" });
    return { ok: true, error: null };
  } catch (error) {
    installCallInProgress = false;
    installRequestInFlight = false;
    const message = error instanceof Error ? error.message : "Unable to request update installation.";
    const friendlyMessage = `The update is downloaded and remains ready, but the installer could not be started: ${message}`;
    emitStatus({ state: "error", message, friendlyMessage, downloadedReady: true, installRequested: false, operationPhase: "error", failedDuring: "ready" });
    return { ok: false, error: friendlyMessage };
  }
}
