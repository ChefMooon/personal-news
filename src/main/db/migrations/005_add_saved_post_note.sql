-- Migration 005: Add note column to saved_posts table
ALTER TABLE saved_posts ADD COLUMN note TEXT;

UPDATE meta SET value = '5' WHERE key = 'schema_version';
UPDATE settings SET value = '5' WHERE key = 'schema_version';
