ALTER TABLE sports_events ADD COLUMN home_team_normalized TEXT;
ALTER TABLE sports_events ADD COLUMN away_team_normalized TEXT;

CREATE INDEX IF NOT EXISTS idx_sports_events_home_team_normalized_date
    ON sports_events (home_team_normalized, event_date);

CREATE INDEX IF NOT EXISTS idx_sports_events_away_team_normalized_date
    ON sports_events (away_team_normalized, event_date);

UPDATE sports_events
SET home_team_normalized = LOWER(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(TRIM(home_team), ' ', ''),
              '.', ''),
            '-', ''),
          '''', ''),
        '&', '')
      ),
    away_team_normalized = LOWER(
        REPLACE(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(TRIM(away_team), ' ', ''),
              '.', ''),
            '-', ''),
          '''', ''),
        '&', '')
      )
WHERE home_team_normalized IS NULL
   OR away_team_normalized IS NULL;
