import Database from "better-sqlite3";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface RequiredSchemaMigration {
  name: string;
  migrationFile: string;
  shouldApply: (database: Database.Database) => boolean;
  // Overrides running the whole migration file, for migrations that must be applied per-column.
  apply?: (database: Database.Database) => void;
}

const SPORTS_EVENT_LOCATION_COLUMNS = ["venue_city", "venue_region", "venue_country"];

const REQUIRED_SCHEMA_MIGRATIONS: RequiredSchemaMigration[] = [
  {
    name: "astronomy-cache-table",
    migrationFile: "010_astronomy_cache.sql",
    shouldApply: (database) => !tableExists(database, "astronomy_cache"),
  },
  {
    name: "ingested-links-table",
    migrationFile: "009_ingested_links.sql",
    shouldApply: (database) => !tableExists(database, "ingested_links"),
  },
  {
    name: "saved-post-metadata-status",
    migrationFile: "011_saved_post_metadata_status.sql",
    shouldApply: (database) => tableExists(database, "saved_posts") && !columnExists(database, "saved_posts", "metadata_status"),
  },
  {
    // Profiles whose schema_version already passed 012 can lack these columns; add only the missing ones.
    name: "sports-event-location-columns",
    migrationFile: "012_sports_event_location.sql",
    shouldApply: (database) =>
      tableExists(database, "sports_events") &&
      SPORTS_EVENT_LOCATION_COLUMNS.some((column) => !columnExists(database, "sports_events", column)),
    apply: (database) => {
      for (const column of SPORTS_EVENT_LOCATION_COLUMNS) {
        if (!columnExists(database, "sports_events", column)) {
          database.exec(`ALTER TABLE sports_events ADD COLUMN ${column} TEXT`);
        }
      }
    },
  },
];

export function ensureRequiredSchemaMigrations(
  database: Database.Database,
  migrationResolver: (migrationFile: string) => string = (migrationFile) =>
    join(__dirname, `../../src/main/db/migrations/${migrationFile}`),
): boolean {
  let appliedAny = false;

  for (const migration of REQUIRED_SCHEMA_MIGRATIONS) {
    if (!migration.shouldApply(database)) {
      continue;
    }

    if (migration.apply) {
      migration.apply(database);
    } else {
      const migrationPath = migrationResolver(migration.migrationFile);
      if (!existsSync(migrationPath)) {
        throw new Error(`[DB] Migration file not found: ${migrationPath}`);
      }

      database.exec(readFileSync(migrationPath, "utf-8"));
    }
    appliedAny = true;
    console.log(`[DB] Compatibility migration applied: ${migration.name}`);
  }

  return appliedAny;
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row != null;
}

function columnExists(database: Database.Database, tableName: string, columnName: string): boolean {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}
