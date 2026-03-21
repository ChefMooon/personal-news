-- Migration 011: remove prototype Reddit Digest seed data

DELETE FROM reddit_digest_posts
WHERE post_id IN (
  'abc001',
  'abc002',
  'abc003',
  'abc004'
);

INSERT OR REPLACE INTO meta VALUES ('schema_version', '11');
INSERT OR REPLACE INTO settings VALUES ('schema_version', '11');