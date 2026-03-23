-- Migration 014: Add notification preferences and per-channel YouTube notification flags

-- Per-channel notification toggles on YouTube channels.
-- 1 = enabled (send desktop notification for this channel type), 0 = suppressed.
ALTER TABLE yt_channels ADD COLUMN notify_new_videos INTEGER NOT NULL DEFAULT 1;
ALTER TABLE yt_channels ADD COLUMN notify_live_start INTEGER NOT NULL DEFAULT 1;

-- Seed the global notification preferences JSON.
-- All categories default to ON so existing users get the full feature immediately.
-- The main process normalises any missing keys to true at read time.
INSERT OR IGNORE INTO settings (key, value)
VALUES (
  'desktop_notification_prefs',
  '{"desktopNotificationsEnabled":true,"youtube":{"newVideo":true,"liveStart":true},"savedPosts":{"syncSuccess":true},"redditDigest":{"runSuccess":true,"runFailure":true},"scriptManager":{"autoRunSuccess":true,"autoRunFailure":true,"startupWarning":true}}'
);
