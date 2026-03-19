-- Migration 003: add durable YouTube API retry queue

CREATE TABLE IF NOT EXISTS yt_sync_retry_batches (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_cycle_id             TEXT NOT NULL,
    batch_index               INTEGER NOT NULL,
    batch_size                INTEGER NOT NULL,
    video_ids_json            TEXT NOT NULL,
    source_channel_ids_json   TEXT NOT NULL,
    request_path              TEXT,
    response_path             TEXT,
    normalized_preview_path   TEXT,
    reason                    TEXT NOT NULL,
    attempt_count             INTEGER NOT NULL DEFAULT 0,
    status                    TEXT NOT NULL DEFAULT 'pending',
    last_error                TEXT,
    next_retry_at             INTEGER,
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL,
    CHECK (status IN ('pending', 'resolved', 'dead'))
);

CREATE INDEX IF NOT EXISTS idx_yt_sync_retry_status_next
    ON yt_sync_retry_batches (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_yt_sync_retry_cycle
    ON yt_sync_retry_batches (poll_cycle_id, batch_index);

INSERT INTO meta (key, value)
VALUES ('schema_version', '3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
