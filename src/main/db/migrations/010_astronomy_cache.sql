CREATE TABLE IF NOT EXISTS astronomy_cache (
    location_id     TEXT PRIMARY KEY,
    payload_json    TEXT NOT NULL,
    status          TEXT NOT NULL,
    for_timestamp   INTEGER,
    calculated_at   INTEGER,
    FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_astronomy_cache_calculated_at
    ON astronomy_cache (calculated_at DESC);

INSERT OR IGNORE INTO settings VALUES ('astronomy_settings_json', '{"enabled":true,"pollIntervalMinutes":60}');
