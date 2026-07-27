CREATE TABLE IF NOT EXISTS ingested_links (
    url_key         TEXT PRIMARY KEY,
    normalized_url TEXT NOT NULL,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL,
    source          TEXT NOT NULL DEFAULT 'reddit'
);

CREATE INDEX IF NOT EXISTS idx_ingested_links_last_seen
    ON ingested_links (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingested_links_source
    ON ingested_links (source);
