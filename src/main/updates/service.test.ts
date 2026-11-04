import { beforeEach, describe, expect, it, vi } from "vitest";

const updater = vi.hoisted(() => ({
  listeners: new Map<string, (value: any) => void>(),
  autoDownload: false,
  autoInstallOnAppQuit: true,
  checkForUpdates: vi.fn(async () => ({})),
  quitAndInstall: vi.fn(),
}));

vi.mock("electron", () => ({ app: { getVersion: () => "1.2.3", isPackaged: true } }));
vi.mock("electron-updater", () => ({ autoUpdater: {
  on: (name: string, listener: (value: any) => void) => updater.listeners.set(name, listener),
  get autoDownload() { return updater.autoDownload; }, set autoDownload(value: boolean) { updater.autoDownload = value; },
  get autoInstallOnAppQuit() { return updater.autoInstallOnAppQuit; }, set autoInstallOnAppQuit(value: boolean) { updater.autoInstallOnAppQuit = value; },
  checkForUpdates: updater.checkForUpdates,
  quitAndInstall: updater.quitAndInstall,
} }));
vi.mock("../settings/store", () => ({ getSetting: () => "1" }));

describe("update service readiness", () => {
  beforeEach(() => {
    updater.listeners.clear();
    updater.checkForUpdates.mockClear();
    updater.quitAndInstall.mockReset();
    vi.resetModules();
  });

  it("retains confirmed download readiness through later failures and rejects duplicate install requests", async () => {
    const service = await import("./service");
    await service.initializeAutoUpdates();
    updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
    expect(service.getCurrentUpdateStatus().downloadedReady).toBe(true);

    updater.listeners.get("error")?.(new Error("network failed"));
    expect(service.getCurrentUpdateStatus().state).toBe("error");
    expect(service.getCurrentUpdateStatus().downloadedReady).toBe(true);
    expect(service.getCurrentUpdateStatus().downloadedVersion).toBe("2.0.0");
    expect(service.getCurrentUpdateStatus().lastCheckAt).toBeUndefined();

    updater.listeners.get("error")?.(new Error("different network failure"));
    expect(service.getCurrentUpdateStatus().message).toBe("different network failure");

    expect(service.installDownloadedUpdate().ok).toBe(true);
    expect(service.getCurrentUpdateStatus().installRequested).toBe(true);
    expect(service.installDownloadedUpdate().ok).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);

    updater.listeners.get("update-available")?.({ version: "3.0.0" });
    expect(service.getCurrentUpdateStatus().version).toBe("3.0.0");
    expect(service.getCurrentUpdateStatus().downloadedReady).toBe(false);
    expect(service.getCurrentUpdateStatus().downloadedVersion).toBeUndefined();
  });

  it("reports synchronous install errors while keeping the downloaded update ready", async () => {
    const service = await import("./service");
    await service.initializeAutoUpdates();
    updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
    updater.quitAndInstall.mockImplementation(() => { throw new Error("spawn unavailable"); });
    const result = service.installDownloadedUpdate();
    expect(result.ok).toBe(false);
    expect(service.getCurrentUpdateStatus().downloadedReady).toBe(true);
    expect(service.getCurrentUpdateStatus().friendlyMessage).toContain("remains ready");
  });

  it("detects an error event emitted synchronously by quitAndInstall and permits retry", async () => {
    const service = await import("./service");
    await service.initializeAutoUpdates();
    updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
    updater.quitAndInstall.mockImplementation(() => {
      updater.listeners.get("error")?.(new Error("No update filepath provided"));
    });

    const result = service.installDownloadedUpdate();
    expect(result.ok).toBe(false);
    expect(service.getCurrentUpdateStatus().state).toBe("error");
    expect(service.getCurrentUpdateStatus().failedDuring).toBe("install-requested");
    expect(service.getCurrentUpdateStatus().downloadedReady).toBe(true);
    expect(service.getCurrentUpdateStatus().installRequested).toBe(false);
    expect(service.getCurrentUpdateStatus().friendlyMessage).toContain("you can try again");
  });

  it("does not rewrite check timestamps for download errors and keeps acceptance through async install errors", async () => {
    const service = await import("./service");
    await service.initializeAutoUpdates();
    updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
    const ready = service.getCurrentUpdateStatus();
    updater.listeners.get("error")?.(new Error("download transport failed"));
    const downloadError = service.getCurrentUpdateStatus();
    expect(downloadError.lastCheckAt).toBe(ready.lastCheckAt);
    expect(downloadError.failedDuring).toBe("ready");

    updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
    expect(service.installDownloadedUpdate().ok).toBe(true);
    updater.listeners.get("error")?.(new Error("spawn failed asynchronously"));
    const installError = service.getCurrentUpdateStatus();
    expect(installError.installRequested).toBe(true);
    expect(installError.downloadedReady).toBe(true);
    expect(installError.failedDuring).toBe("install-requested");
    expect(installError.friendlyMessage).toContain("will not send another install request");
    expect(service.installDownloadedUpdate().ok).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
