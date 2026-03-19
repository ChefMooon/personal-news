-- Migration 004: add media_type to YouTube videos for richer UI and filtering.

ALTER TABLE yt_videos ADD COLUMN media_type TEXT;

-- Backfill from existing fields so older rows remain useful before refresh.
UPDATE yt_videos
SET media_type = CASE
  WHEN broadcast_status = 'live' THEN 'live'
  WHEN broadcast_status = 'upcoming' THEN 'upcoming_stream'
  WHEN duration_sec IS NOT NULL AND duration_sec <= 60 THEN 'short'
  ELSE 'video'
END
WHERE media_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_yt_videos_media_type_published
    ON yt_videos (media_type, published_at DESC);

INSERT INTO meta (key, value)
VALUES ('schema_version', '4')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;