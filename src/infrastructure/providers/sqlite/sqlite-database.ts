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

    create table if not exists actors (
      id text primary key,
      display_name text not null,
      role text not null check (role in ('owner', 'family')),
      status text not null check (status in ('pending', 'active', 'blocked')),
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    create table if not exists actor_identities (
      id text primary key,
      actor_id text not null references actors(id),
      provider text not null,
      provider_user_id text not null,
      status text not null check (status in ('pending', 'active', 'blocked')),
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      unique (provider, provider_user_id)
    );

    create table if not exists messenger_chats (
      id text primary key,
      provider text not null,
      provider_chat_id text not null,
      kind text not null check (
        kind in ('owner_private', 'family_private', 'family_group')
      ),
      approved integer not null check (approved in (0, 1)),
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      unique (provider, provider_chat_id)
    );

    create table if not exists admin_sessions (
      id text primary key,
      actor_id text not null references actors(id),
      chat_id text not null references messenger_chats(id),
      last_activity_at text not null,
      expires_at text not null,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    create table if not exists monitored_services (
      id text primary key,
      name text not null unique,
      health_source_kind text not null check (health_source_kind in ('manual')),
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );
  `);
}
