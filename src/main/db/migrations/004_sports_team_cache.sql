CREATE TABLE IF NOT EXISTS sports_opponent_cache (
    team_id    TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    badge_url  TEXT,
    fetched_at INTEGER NOT NULL
);
