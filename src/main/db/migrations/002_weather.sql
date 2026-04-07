CREATE TABLE IF NOT EXISTS weather_locations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    admin1        TEXT,
    country       TEXT,
    country_code  TEXT,
    latitude      REAL NOT NULL,
    longitude     REAL NOT NULL,
    timezone      TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weather_cache (
    location_id  TEXT PRIMARY KEY,
    current_json TEXT NOT NULL,
    hourly_json  TEXT NOT NULL,
    daily_json   TEXT NOT NULL,
    alerts_json  TEXT NOT NULL,
    fetched_at   INTEGER NOT NULL,
    FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weather_cache_fetched_at
    ON weather_cache (fetched_at DESC);

CREATE TABLE IF NOT EXISTS weather_alert_state (
    location_id      TEXT PRIMARY KEY,
    alert_hash       TEXT,
    last_notified_at INTEGER,
    FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO settings VALUES ('weather_enabled', 'true');
INSERT OR IGNORE INTO settings VALUES (
    'weather_settings_json',
    '{"pollIntervalMinutes":30,"defaultLocationId":null,"temperatureUnit":"celsius","windSpeedUnit":"kmh","precipitationUnit":"mm","timeFormat":"system","showAlertsInWidgets":true,"thresholds":{"rainMm":10,"snowCm":5,"windKph":45,"freezeTempC":0,"heatTempC":32}}'
);