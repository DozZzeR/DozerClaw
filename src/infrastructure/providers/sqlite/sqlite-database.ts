import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export interface CreateSqliteDatabaseOptions {
  readonly path: string;
}

export function createSqliteDatabase(
  options: CreateSqliteDatabaseOptions
): SqliteDatabase {
  ensureDatabaseDirectory(options.path);

  const database = new Database(options.path);
  bootstrapSqliteDatabase(database);

  return database;
}

function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:") {
    return;
  }

  const directory = dirname(databasePath);

  if (directory === ".") {
    return;
  }

  mkdirSync(directory, { recursive: true });
}

function bootstrapSqliteDatabase(database: SqliteDatabase): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    create table if not exists operational_events (
      id integer primary key autoincrement,
      type text not null,
      occurred_at text not null,
      attributes_json text not null,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}
