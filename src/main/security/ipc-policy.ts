import { IPC } from "../../shared/ipc-types";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAIN_TO_RENDERER_CHANNELS = new Set<string>([
  IPC.APP_SHOW_TRAY_HINT, IPC.WINDOW_STATE_CHANGED, IPC.UPDATES_STATUS,
  IPC.WEATHER_UPDATED, IPC.ASTRONOMY_UPDATED, IPC.SPORTS_DATA_UPDATED,
  IPC.SPORTS_FETCH_WARNING, IPC.YOUTUBE_VIDEO_WATCHED_CHANGED, IPC.YOUTUBE_UPDATED,
  IPC.REDDIT_DIGEST_VIEWED_CHANGED, IPC.REDDIT_NTFY_INGEST_COMPLETE, IPC.REDDIT_UPDATED,
  IPC.SCRIPTS_OUTPUT, IPC.SCRIPTS_RUN_COMPLETE, IPC.SCRIPTS_UPDATED, IPC.DEV_TEST_DATA_UPDATED,
]);

const rendererChannelPrefixes = /^(window:(minimize|toggleMaximize|close|getState)|updates:(getStatus|checkForUpdates|installUpdate)|weather:|astronomy:|settings:|sports:|youtube:|reddit:|scripts:|themes:|devTestData:|shell:|dialog:)/;
export const RENDERER_TO_MAIN_CHANNELS = new Set<string>(
  Object.values(IPC).filter((channel) => rendererChannelPrefixes.test(channel) && !MAIN_TO_RENDERER_CHANNELS.has(channel) && channel !== IPC.SETTINGS_GET_THEME_SYNC && channel !== IPC.SETTINGS_GET_SIDEBAR_CONFIG_SYNC),
);

const genericSettingKeys = new Set([
  "app_close_to_tray", "app_start_minimized", "app_minimize_to_tray", "app_launch_at_login",
  "app_restore_window_bounds", "app_start_maximized", "app_auto_update_check_enabled", "app_window_bounds",
  "reddit_digest_enabled", "reddit_digest_page_view_mode", "reddit_digest_view_config", "reddit_digest_subreddits", "reddit_digest_week_start",
  "youtube_view_config", "saved_posts_view_config",
  "saved_posts_enabled", "sports_enabled", "weather_enabled", "ntfy_topic", "ntfy_server_url",
  "youtube_page_view_mode", "youtube_page_density", "youtube_page_density_by_mode", "youtube_page_hide_watched", "script_home_dir",
  "rss_poll_interval_minutes", "ntfy_poll_interval_minutes", "saved_posts_ingest_delay_seconds",
  "sports_page_sport_order",
]);
const harnessOnlyGenericSettingKeys = new Set([
  "local_test_data_sentinel", "astronomy_settings_json", "dev_test_data_applied_version",
  "dev_test_data_sports_defaults_migration_version",
]);

export function isAllowedGenericSettingKey(key: unknown, harnessMode = false): key is string {
  if (typeof key !== "string" || key.length > 128) return false;
  if (harnessOnlyGenericSettingKeys.has(key)) return harnessMode;
  if (genericSettingKeys.has(key)) return true;
  const dynamicPrefixes = ["astronomy_view_config:", "weather_view_config:", "sports_view_config:", "youtube_view_config:", "saved_posts_view_config:", "reddit_digest_view_config:"];
  return dynamicPrefixes.some((prefix) => key.startsWith(prefix) && /^[A-Za-z0-9_-]{1,80}$/.test(key.slice(prefix.length)));
}

export function parseExternalHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export function isExactHttpsHost(url: URL, hostname: string): boolean {
  return url.protocol === "https:" && url.hostname.toLowerCase() === hostname.toLowerCase() && !url.username && !url.password;
}

export function sameCanonicalPath(left: string, right: string, platform = process.platform): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform === "win32"
    ? normalizedLeft.toLocaleLowerCase("en-US") === normalizedRight.toLocaleLowerCase("en-US")
    : normalizedLeft === normalizedRight;
}

export function isTrustedRendererUrl(value: string, packaged: boolean, configuredUrl?: string, trustedFilePath?: string): boolean {
  try {
    const target = new URL(value);
    if (target.protocol === "file:") return Boolean(trustedFilePath) && resolve(fileURLToPath(target)) === resolve(trustedFilePath!);
    if (packaged || !configuredUrl) return false;
    const configured = new URL(configuredUrl);
    return target.origin === configured.origin && target.pathname === configured.pathname;
  } catch {
    return false;
  }
}

export function isTrustedIpcSenderIdentity(sender: unknown, mainFrame: unknown, senderFrame: unknown, trustedSender: unknown): boolean {
  return trustedSender !== null && sender === trustedSender && mainFrame === senderFrame;
}

export function setSyncIpcRejectionResult(event: { returnValue: unknown }): void {
  event.returnValue = null;
}
