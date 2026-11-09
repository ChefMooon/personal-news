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
const harness = vi.hoisted(() => ({ active: false }));
vi.mock("../harness-mode", () => ({ isElectronHarnessRun: () => harness.active }));

describe("update service readiness", () => {
  beforeEach(() => {
    updater.listeners.clear();
    updater.checkForUpdates.mockClear();
    updater.quitAndInstall.mockReset();
    harness.active = false;
    vi.resetModules();
  });

  describe("harness update simulation", () => {
    const html = "<h3>Fixed</h3><ul><li>x</li></ul>";
    const expected = { sections: [{ heading: "Fixed", items: ["x"] }] };

    it("refuses and emits nothing outside harness mode", async () => {
      const service = await import("./service");
      const listener = vi.fn();
      service.setUpdateStatusListener(listener);
      listener.mockClear();
      const result = service.simulateDownloadedUpdateForHarness({ version: "9.9.9", releaseNotesHtml: html });
      expect(result.ok).toBe(false);
      expect(listener).not.toHaveBeenCalled();
      expect(service.getCurrentUpdateStatus().downloadedReady).toBe(false);
    });

    it("emits a downloaded status with parsed notes in harness mode and refuses install", async () => {
      harness.active = true;
      const service = await import("./service");
      await service.initializeAutoUpdates();
      const listener = vi.fn();
      service.setUpdateStatusListener(listener);
      listener.mockClear();
      expect(service.simulateDownloadedUpdateForHarness({ version: "9.9.9", releaseNotesHtml: html })).toEqual({ ok: true, error: null });
      const status = service.getCurrentUpdateStatus();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(status.state).toBe("downloaded");
      expect(status.downloadedReady).toBe(true);
      expect(status.version).toBe("9.9.9");
      expect(status.downloadedVersion).toBe("9.9.9");
      expect(status.releaseNotes).toEqual(expected);
      expect(status.downloadedReleaseNotes).toEqual(expected);

      expect(service.installDownloadedUpdate()).toEqual({ ok: false, error: "Simulated update cannot be installed." });
      expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });

    it("clears the simulated flag when a real update downloads", async () => {
      harness.active = true;
      const service = await import("./service");
      await service.initializeAutoUpdates();
      service.simulateDownloadedUpdateForHarness({ version: "9.9.9", releaseNotesHtml: html });
      updater.listeners.get("update-downloaded")?.({ version: "2.0.0" });
      expect(service.installDownloadedUpdate().ok).toBe(true);
      expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid versions and oversized or non-string notes", async () => {
      harness.active = true;
      const service = await import("./service");
      const listener = vi.fn();
      service.setUpdateStatusListener(listener);
      listener.mockClear();
      for (const version of ["1.2", "v1.2.3", "1.2.3-beta", "", 123 as unknown as string]) {
        expect(service.simulateDownloadedUpdateForHarness({ version, releaseNotesHtml: html }).ok).toBe(false);
      }
      expect(service.simulateDownloadedUpdateForHarness({ version: "1.2.3", releaseNotesHtml: "x".repeat(100_001) }).ok).toBe(false);
      expect(service.simulateDownloadedUpdateForHarness({ version: "1.2.3", releaseNotesHtml: 5 as unknown as string }).ok).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });
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

  it("parses updater HTML release notes into a structured document", async () => {
    const service = await import("./service");
    await service.initializeAutoUpdates();
    updater.listeners.get("update-downloaded")?.({
      version: "2.0.0",
      releaseNotes: "<h3>Fixed</h3><ul><li>x &amp; y</li></ul>",
    });
    const status = service.getCurrentUpdateStatus();
    const expected = { sections: [{ heading: "Fixed", items: ["x & y"] }] };
    expect(status.downloadedReleaseNotes).toEqual(expected);
    expect(status.releaseNotes).toEqual(expected);
    expect(typeof status.downloadedReleaseNotes).toBe("object");
    expect(typeof status.releaseNotes).toBe("object");
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
