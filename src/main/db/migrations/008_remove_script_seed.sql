-- Migration 008: remove prototype Script Manager seed data

DELETE FROM script_runs
WHERE script_id IN (1, 2);

DELETE FROM scripts
WHERE id IN (1, 2);

INSERT OR REPLACE INTO meta VALUES ('schema_version', '8');
INSERT OR REPLACE INTO settings VALUES ('schema_version', '8');
