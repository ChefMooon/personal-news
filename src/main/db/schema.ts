import Database from "better-sqlite3";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface RequiredSchemaMigration {
  name: string;
  migrationFile: string;
  shouldApply: (database: Database.Database) => boolean;
}

const REQUIRED_SCHEMA_MIGRATIONS: RequiredSchemaMigration[] = [
  {
    name: "ingested-links-table",
    migrationFile: "009_ingested_links.sql",
    shouldApply: (database) => !tableExists(database, "ingested_links"),
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

    const migrationPath = migrationResolver(migration.migrationFile);
    if (!existsSync(migrationPath)) {
      throw new Error(`[DB] Migration file not found: ${migrationPath}`);
    }

    database.exec(readFileSync(migrationPath, "utf-8"));
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
