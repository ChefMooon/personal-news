-- Migration 005: Preserve YouTube livestream lifecycle fields

ALTER TABLE yt_videos ADD COLUMN actual_start_time INTEGER;
ALTER TABLE yt_videos ADD COLUMN actual_end_time INTEGER;
ALTER TABLE yt_videos ADD COLUMN is_livestream INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_yt_videos_lifecycle_refresh
    ON yt_videos (broadcast_status, is_livestream, actual_end_time, actual_start_time);

CREATE INDEX IF NOT EXISTS idx_yt_videos_channel_lifecycle_sort
    ON yt_videos (channel_id, broadcast_status, is_livestream, actual_end_time DESC, actual_start_time DESC, scheduled_start DESC, published_at DESC);
