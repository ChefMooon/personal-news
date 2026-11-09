import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { IPC } from "../../../shared/ipc-types";
import {
  isAllowedGenericSettingKey,
  isExactHttpsHost,
  isTrustedIpcSenderIdentity,
  isTrustedRendererUrl,
  MAIN_TO_RENDERER_CHANNELS,
  parseExternalHttpUrl,
  RENDERER_TO_MAIN_CHANNELS,
  sameCanonicalPath,
  setSyncIpcRejectionResult,
} from "../ipc-policy";

describe("IPC policy", () => {
  it("keeps invoke and event channels in their intended directions", () => {
    expect(RENDERER_TO_MAIN_CHANNELS.has(IPC.SPORTS_REFRESH)).toBe(true);
    expect(MAIN_TO_RENDERER_CHANNELS.has(IPC.SPORTS_DATA_UPDATED)).toBe(true);
    expect(RENDERER_TO_MAIN_CHANNELS.has(IPC.SPORTS_DATA_UPDATED)).toBe(false);
    expect(MAIN_TO_RENDERER_CHANNELS.has(IPC.SETTINGS_SET)).toBe(false);
    expect(RENDERER_TO_MAIN_CHANNELS.has(IPC.SETTINGS_GET_THEME_SYNC)).toBe(false);
  });

  it("exposes the what's-new channels to the renderer only", () => {
    for (const channel of [IPC.UPDATES_GET_PENDING_WHATS_NEW, IPC.UPDATES_ACKNOWLEDGE_WHATS_NEW]) {
      expect(RENDERER_TO_MAIN_CHANNELS.has(channel)).toBe(true);
      expect(MAIN_TO_RENDERER_CHANNELS.has(channel)).toBe(false);
    }
  });

  it("exposes the simulate-status channel only to harness launches", async () => {
    expect(RENDERER_TO_MAIN_CHANNELS.has(IPC.UPDATES_SIMULATE_STATUS)).toBe(false);
    expect(MAIN_TO_RENDERER_CHANNELS.has(IPC.UPDATES_SIMULATE_STATUS)).toBe(false);

    const previous = process.env.PERSONAL_NEWS_ELECTRON_HARNESS;
    process.env.PERSONAL_NEWS_ELECTRON_HARNESS = "1";
    try {
      vi.resetModules();
      const harnessPolicy = await import("../ipc-policy");
      expect(harnessPolicy.RENDERER_TO_MAIN_CHANNELS.has(IPC.UPDATES_SIMULATE_STATUS)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.PERSONAL_NEWS_ELECTRON_HARNESS;
      else process.env.PERSONAL_NEWS_ELECTRON_HARNESS = previous;
      vi.resetModules();
    }
  });

  it("keeps the simulate handler and generic settings gating wired to the harness check", () => {
    // Source-level guard: registerIpcHandlers is too large to execute in a unit test,
    // so assert the gating structure cannot be hoisted or dropped unnoticed.
    const source = readFileSync(fileURLToPath(new URL("../../ipc/index.ts", import.meta.url)), "utf8");
    expect(source.match(/IPC\.UPDATES_SIMULATE_STATUS/g)).toHaveLength(1);
    expect(source).toMatch(/if \(isElectronHarnessRun\(\)\) \{\s*ipcMain\.handle\(\s*IPC\.UPDATES_SIMULATE_STATUS/);
    expect(source.match(/isAllowedGenericSettingKey\(key, isElectronHarnessRun\(\)\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("gates the what's-new last-seen setting to harness mode", () => {
    expect(isAllowedGenericSettingKey("whats_new_last_seen_version")).toBe(false);
    expect(isAllowedGenericSettingKey("whats_new_last_seen_version", false)).toBe(false);
    expect(isAllowedGenericSettingKey("whats_new_last_seen_version", true)).toBe(true);
  });

  it("accepts only explicitly supported generic settings", () => {
    expect(isAllowedGenericSettingKey("script_home_dir")).toBe(true);
    expect(isAllowedGenericSettingKey("youtube_page_density")).toBe(true);
    expect(isAllowedGenericSettingKey("sports_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("weather_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("astronomy_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("reddit_digest_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("saved_posts_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("youtube_view_config:widget-1")).toBe(true);
    expect(isAllowedGenericSettingKey("youtube_page_density_by_mode")).toBe(true);
    expect(isAllowedGenericSettingKey("reddit_digest_view_config")).toBe(true);
    expect(isAllowedGenericSettingKey("local_test_data_sentinel")).toBe(false);
    expect(isAllowedGenericSettingKey("astronomy_settings_json")).toBe(false);
    expect(isAllowedGenericSettingKey("local_test_data_sentinel", true)).toBe(true);
    expect(isAllowedGenericSettingKey("astronomy_settings_json", true)).toBe(true);
    expect(isAllowedGenericSettingKey("sports_view_config:../secret")).toBe(false);
    expect(isAllowedGenericSettingKey("youtube_api_key_encrypted")).toBe(false);
    expect(isAllowedGenericSettingKey("arbitrary_setting")).toBe(false);
    expect(isAllowedGenericSettingKey({})).toBe(false);
  });

  it("allows only HTTP(S) external links", () => {
    expect(parseExternalHttpUrl("https://example.com/path")?.protocol).toBe("https:");
    expect(parseExternalHttpUrl("http://localhost:4175/")?.protocol).toBe("http:");
    expect(parseExternalHttpUrl("file:///tmp/secret")).toBeNull();
    expect(parseExternalHttpUrl("javascript:alert(1)")).toBeNull();
    expect(parseExternalHttpUrl("https://user:pass@example.com")).toBeNull();
    expect(parseExternalHttpUrl("https://example.com/\nother")).toBeNull();
    expect(parseExternalHttpUrl("x".repeat(4097))).toBeNull();
  });

  it("requires the exact HTTPS provider host for credential-bearing API redirects", () => {
    expect(isExactHttpsHost(new URL("https://www.googleapis.com/youtube/v3"), "www.googleapis.com")).toBe(true);
    expect(isExactHttpsHost(new URL("https://attacker.googleapis.com/youtube/v3"), "www.googleapis.com")).toBe(false);
    expect(isExactHttpsHost(new URL("http://www.googleapis.com/youtube/v3"), "www.googleapis.com")).toBe(false);
    expect(isExactHttpsHost(new URL("https://user:pass@www.googleapis.com/youtube/v3"), "www.googleapis.com")).toBe(false);
  });

  it("compares canonical folder paths with Windows case rules", () => {
    expect(sameCanonicalPath("C:\\Scripts\\", "c:\\scripts", "win32")).toBe(true);
    expect(sameCanonicalPath("/home/user/scripts", "/home/user/scripts", "linux")).toBe(true);
    expect(sameCanonicalPath("/home/user/scripts", "/home/user/other", "linux")).toBe(false);
  });

  it("trusts only the renderer URL in packaged and development modes", () => {
    const trustedFile = resolve("app/renderer/index.html");
    const trustedUrl = pathToFileURL(trustedFile).toString();
    expect(isTrustedRendererUrl(trustedUrl, true, undefined, trustedFile)).toBe(true);
    expect(isTrustedRendererUrl(pathToFileURL(resolve("tmp/renderer/index.html")).toString(), true, undefined, trustedFile)).toBe(false);
    expect(isTrustedRendererUrl(pathToFileURL(resolve("app/other.html")).toString(), true, undefined, trustedFile)).toBe(false);
    expect(isTrustedRendererUrl("http://localhost:5173/", false, "http://localhost:5173/")).toBe(true);
    expect(isTrustedRendererUrl("http://localhost:5173/evil", false, "http://localhost:5173/")).toBe(false);
    expect(isTrustedRendererUrl("http://evil.test/", true, "http://evil.test/")).toBe(false);
  });

  it("requires the exact registered app WebContents and main frame identity", () => {
    const trusted = {};
    const mainFrame = {};
    expect(isTrustedIpcSenderIdentity(trusted, mainFrame, mainFrame, trusted)).toBe(true);
    expect(isTrustedIpcSenderIdentity({}, mainFrame, mainFrame, trusted)).toBe(false);
    expect(isTrustedIpcSenderIdentity(trusted, mainFrame, {}, trusted)).toBe(false);
    expect(isTrustedIpcSenderIdentity(trusted, mainFrame, mainFrame, null)).toBe(false);
  });

  it("sets a synchronous IPC rejection result immediately", () => {
    const event: { returnValue: unknown } = { returnValue: undefined };
    setSyncIpcRejectionResult(event);
    expect(event.returnValue).toBeNull();
  });
});
