CREATE TABLE IF NOT EXISTS sports_leagues (
    league_id   TEXT PRIMARY KEY,
    sport       TEXT NOT NULL,
    name        TEXT NOT NULL,
    country     TEXT,
    logo_url    TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    added_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sports_teams (
    team_id     TEXT PRIMARY KEY,
    league_id   TEXT NOT NULL,
    sport       TEXT NOT NULL,
    name        TEXT NOT NULL,
    short_name  TEXT,
    badge_url   TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    added_at    INTEGER NOT NULL,
    FOREIGN KEY (league_id) REFERENCES sports_leagues(league_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sports_events (
    event_id       TEXT PRIMARY KEY,
    league_id      TEXT NOT NULL,
    sport          TEXT NOT NULL,
    home_team_id   TEXT,
    away_team_id   TEXT,
    home_team      TEXT NOT NULL,
    away_team      TEXT NOT NULL,
    home_score     TEXT,
    away_score     TEXT,
    event_date     TEXT NOT NULL,
    event_time     TEXT,
    status         TEXT,
    venue          TEXT,
    fetched_date   TEXT NOT NULL,
    FOREIGN KEY (league_id) REFERENCES sports_leagues(league_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sports_events_sport_date
    ON sports_events (sport, event_date);

CREATE INDEX IF NOT EXISTS idx_sports_events_team_date
    ON sports_events (home_team_id, away_team_id, event_date);

CREATE TABLE IF NOT EXISTS sports_cache_meta (
    sport        TEXT NOT NULL,
    fetch_date   TEXT NOT NULL,
    fetched_at   INTEGER NOT NULL,
    PRIMARY KEY (sport, fetch_date)
);

INSERT OR IGNORE INTO settings VALUES ('sports_enabled', 'true');