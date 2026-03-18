-- Migration 002: remove prototype YouTube seed data

DELETE FROM yt_videos
WHERE video_id IN (
  'dQw4w9WgXcQ',
  'abc123def456',
  'liveStream001',
  'xyz789ghi000',
  'xyz789ghi001'
);

DELETE FROM yt_channels
WHERE channel_id IN (
  'UC_x5XG1OV2P6uZZ5FSM9Ttw',
  'UCVHFbw7woebKtfvTzSGJ1pQ'
)
AND added_at IN (1700000000, 1700000100);

INSERT INTO meta (key, value)
VALUES ('schema_version', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
