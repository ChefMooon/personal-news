import type Database from "better-sqlite3";

export interface DevTestDataContributor {
  readonly id: string;
  seed(database: Database.Database): void;
  clear(database: Database.Database): void;
}
