import type Database from "better-sqlite3";
import type { FixtureContext } from "./fixtures";

export interface DevTestDataContributor {
  readonly id: string;
  seed(database: Database.Database, context?: FixtureContext): void;
  clear(database: Database.Database): void;
}
