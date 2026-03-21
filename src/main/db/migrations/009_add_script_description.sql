-- Migration 009: Schema version bump only
-- The initial schema already includes scripts.description, so this migration
-- only records that schema version 9 has been reached.

INSERT OR REPLACE INTO meta VALUES ('schema_version', '9');
INSERT OR REPLACE INTO settings VALUES ('schema_version', '9');
