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

  `);

  ensureMonitoredServicesTable(database);
  ensureFileInboxRecordsTable(database);
  ensurePendingClarificationsTable(database);
  ensurePendingFileDuplicateDecisionsTable(database);
}

function ensureFileInboxRecordsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists file_inbox_records (
      id text primary key,
      original_file_name text not null,
      mime_type text,
      size_bytes integer not null,
      storage_id text not null,
      storage_path text not null,
      received_at text not null,
      created_at text not null
    );
  `);
}

function ensureMonitoredServicesTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists monitored_services (
      id text primary key,
      name text not null unique,
      health_source_kind text not null check (
        health_source_kind in ('manual', 'local_path', 'http_health')
      ),
      health_source_config_json text,
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );
  `);

  ensureColumn(
    database,
    "monitored_services",
    "health_source_config_json",
    "health_source_config_json text"
  );

  const table = database
    .prepare(
      "select sql from sqlite_master where type = 'table' and name = 'monitored_services'"
    )
    .get() as { readonly sql: string } | undefined;

  if (table?.sql.includes("'http_health'")) {
    return;
  }

  database.exec(`
    alter table monitored_services rename to monitored_services_old;

    create table monitored_services (
      id text primary key,
      name text not null unique,
      health_source_kind text not null check (
        health_source_kind in ('manual', 'local_path', 'http_health')
      ),
      health_source_config_json text,
      enabled integer not null check (enabled in (0, 1)),
      created_at text not null,
      updated_at text not null
    );

    insert into monitored_services (
      id,
      name,
      health_source_kind,
      health_source_config_json,
      enabled,
      created_at,
      updated_at
    )
    select
      id,
      name,
      health_source_kind,
      health_source_config_json,
      enabled,
      created_at,
      updated_at
    from monitored_services_old;

    drop table monitored_services_old;
  `);
}

function ensurePendingClarificationsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists pending_clarifications (
      chat_id text primary key,
      actor_id text not null,
      original_text text not null,
      original_attachments_json text not null,
      question text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingFileDuplicateDecisionsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists pending_file_duplicate_decisions (
      chat_id text primary key,
      actor_id text not null,
      file_name text not null,
      suggested_copy_name text not null,
      existing_record_id text not null,
      provider text,
      received_at text,
      source_attachment_json text,
      created_at text not null,
      expires_at text not null
    );
  `);

  ensureColumn(database, "pending_file_duplicate_decisions", "provider", "provider text");
  ensureColumn(database, "pending_file_duplicate_decisions", "received_at", "received_at text");
  ensureColumn(database, "pending_file_duplicate_decisions", "source_attachment_json", "source_attachment_json text");
}

function ensureColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = database
    .prepare(`pragma table_info(${tableName})`)
    .all() as readonly { readonly name: string }[];

  if (!columns.some((column) => column.name === columnName)) {
    database.exec(`alter table ${tableName} add column ${definition}`);
  }
}
