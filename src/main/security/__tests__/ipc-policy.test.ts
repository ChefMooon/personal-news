import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
