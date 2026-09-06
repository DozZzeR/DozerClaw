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
  ensureDocumentsTable(database);
  ensureFamilyFactsTable(database);
  ensureFamilyJournalEntriesTable(database);
  ensureShoppingItemsTable(database);
  ensureFamilySubjectAliasesTable(database);
  ensureLastOperationContextsTable(database);
  ensurePendingClarificationsTable(database);
  ensurePendingFileDuplicateDecisionsTable(database);
  ensurePendingFileDestinationDecisionsTable(database);
  ensurePendingFamilyFactDecisionsTable(database);
  ensurePendingFamilyFactArchiveDecisionsTable(database);
  ensurePendingShoppingItemDecisionsTable(database);
  ensurePendingDocumentDecisionsTable(database);
  ensurePendingDocumentPlacementDecisionsTable(database);
  ensureNotificationsTables(database);
  ensureProcessedMessageReceiptsTable(database);
  ensureIndexes(database);
}

function ensureIndexes(database: SqliteDatabase): void {
  // Secondary indexes for the hot read patterns exercised by the repositories.
  // All are additive and do not change query results.
  database.exec(`
    create index if not exists idx_family_facts_status_created_at
      on family_facts (status, created_at desc);

    create index if not exists idx_family_journal_status_occurred_at
      on family_journal_entries (status, occurred_at desc);

    create index if not exists idx_shopping_items_status_created_at
      on shopping_items (status, created_at desc);

    create index if not exists idx_documents_status_updated_at
      on documents (status, updated_at desc);

    create index if not exists idx_documents_subject_id
      on documents (subject_id);

    create index if not exists idx_documents_document_type
      on documents (document_type);

    create index if not exists idx_file_inbox_records_name_created_at
      on file_inbox_records (original_file_name, created_at desc);

    create index if not exists idx_notification_deliveries_actor_id
      on notification_deliveries (actor_id);

    create index if not exists idx_operational_events_type_id
      on operational_events (type, id desc);
  `);
}

function ensureProcessedMessageReceiptsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists processed_message_receipts (
      provider text not null,
      provider_chat_id text not null,
      message_id text not null,
      reply_chat_id text not null,
      reply_text text not null,
      processed_at text not null,
      primary key (provider, provider_chat_id, message_id)
    );
  `);
}

function ensureNotificationsTables(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists notifications (
      id text primary key,
      scope text not null check (scope in ('family', 'personal')),
      title text not null,
      body text not null,
      source_kind text,
      source_id text,
      created_by_actor_id text,
      created_at text not null
    );

    create table if not exists notification_deliveries (
      notification_id text not null references notifications(id) on delete cascade,
      actor_id text not null references actors(id),
      read_at text,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      primary key (notification_id, actor_id)
    );
  `);
}

function ensureDocumentsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists documents (
      id text primary key,
      provider text not null check (provider in ('google_drive')),
      external_id text not null,
      name text not null,
      url text not null,
      document_type text check (
        document_type in (
          'identity',
          'legal',
          'health',
          'finance',
          'education',
          'travel',
          'home',
          'reference',
          'other'
        )
      ),
      subject_id text,
      semantic_memory_entry_id text,
      status text not null check (status in ('registered', 'archived')),
      created_at text not null,
      updated_at text not null,
      unique (provider, external_id)
    );
  `);

  ensureColumn(
    database,
    "documents",
    "document_type",
    "document_type text"
  );
  ensureColumn(database, "documents", "subject_id", "subject_id text");
  ensureColumn(
    database,
    "documents",
    "semantic_memory_entry_id",
    "semantic_memory_entry_id text"
  );
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

function ensureFamilyFactsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists family_facts (
      id text primary key,
      category text not null check (
        category in ('event', 'preference', 'place', 'reference_link')
      ),
      body text not null,
      subject_id text,
      semantic_memory_entry_id text,
      source_actor_id text not null,
      source_chat_id text not null,
      source_message_text text not null,
      status text not null check (status in ('active', 'archived')),
      created_at text not null,
      updated_at text not null
    );
  `);

  ensureColumn(
    database,
    "family_facts",
    "semantic_memory_entry_id",
    "semantic_memory_entry_id text"
  );
}

function ensureFamilyJournalEntriesTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists family_journal_entries (
      id text primary key,
      category text not null check (
        category in (
          'health',
          'child',
          'sleep',
          'food',
          'mood',
          'school',
          'milestone',
          'other'
        )
      ),
      body text not null,
      subject_id text,
      semantic_memory_entry_id text,
      source_actor_id text not null,
      source_chat_id text not null,
      source_message_text text not null,
      status text not null check (status in ('active', 'archived')),
      occurred_at text not null,
      created_at text not null,
      updated_at text not null
    );
  `);
}

function ensureShoppingItemsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists shopping_items (
      id text primary key,
      title text not null,
      store_hint text,
      project_tag text,
      tags_json text not null,
      semantic_memory_entry_id text,
      source_actor_id text not null,
      source_chat_id text not null,
      source_message_text text not null,
      status text not null check (status in ('open', 'bought', 'archived')),
      created_at text not null,
      updated_at text not null
    );
  `);
}

function ensureFamilySubjectAliasesTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists family_subject_aliases (
      alias_subject_id text primary key,
      canonical_subject_id text not null
    );
  `);
}

function ensureLastOperationContextsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists last_operation_contexts (
      chat_id text not null,
      actor_id text not null,
      operation_kind text not null check (
        operation_kind in (
          'file_stored',
          'document_uploaded',
          'document_registered',
          'family_fact_recorded',
          'family_journal_entry_recorded',
          'planning_task_created'
        )
      ),
      entity_kind text not null check (
        entity_kind in (
          'file_inbox_record',
          'document',
          'family_fact',
          'family_journal_entry',
          'planning_task'
        )
      ),
      entity_id text not null,
      entity_label text,
      document_json text,
      created_at text not null,
      expires_at text not null,
      primary key (chat_id, actor_id)
    );
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

function ensurePendingFileDestinationDecisionsTable(
  database: SqliteDatabase
): void {
  database.exec(`
    create table if not exists pending_file_destination_decisions (
      chat_id text primary key,
      actor_id text not null,
      provider text not null,
      received_at text not null,
      attachments_json text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingFamilyFactDecisionsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists pending_family_fact_decisions (
      chat_id text primary key,
      actor_id text not null,
      new_fact_json text not null,
      candidates_json text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingFamilyFactArchiveDecisionsTable(
  database: SqliteDatabase
): void {
  database.exec(`
    create table if not exists pending_family_fact_archive_decisions (
      chat_id text primary key,
      actor_id text not null,
      candidates_json text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingShoppingItemDecisionsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists pending_shopping_item_decisions (
      chat_id text primary key,
      actor_id text not null,
      action text not null check (action in ('mark_bought', 'archive')),
      candidates_json text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingDocumentDecisionsTable(database: SqliteDatabase): void {
  database.exec(`
    create table if not exists pending_document_decisions (
      chat_id text primary key,
      actor_id text not null,
      action_json text not null,
      candidates_json text not null,
      created_at text not null,
      expires_at text not null
    );
  `);
}

function ensurePendingDocumentPlacementDecisionsTable(
  database: SqliteDatabase
): void {
  database.exec(`
    create table if not exists pending_document_placement_decisions (
      chat_id text primary key,
      actor_id text not null,
      document_json text not null,
      target_folder_path text not null,
      target_folder_id text,
      created_at text not null,
      expires_at text not null
    );
  `);
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
