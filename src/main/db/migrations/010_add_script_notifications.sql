-- Migration 010: add script_notifications table for run and scheduler warning events

CREATE TABLE IF NOT EXISTS script_notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id   INTEGER NOT NULL,
    run_id      INTEGER,
    severity    TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    message     TEXT NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    read_at     INTEGER,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES script_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_script_notifications_created
    ON script_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_notifications_read
    ON script_notifications (is_read, created_at DESC);

INSERT OR REPLACE INTO meta VALUES ('schema_version', '10');
INSERT OR REPLACE INTO settings VALUES ('schema_version', '10');
