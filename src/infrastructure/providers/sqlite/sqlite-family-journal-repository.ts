import type { FamilyJournalEntry } from "../../../core/domain/family-journal/family-journal-entry.js";
import type { FamilyJournalRepositoryPort } from "../../../ports/family-journal-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface FamilyJournalEntryRow {
  readonly id: string;
  readonly category: FamilyJournalEntry["category"];
  readonly body: string;
  readonly subject_id: string | null;
  readonly semantic_memory_entry_id: string | null;
  readonly source_actor_id: string;
  readonly source_chat_id: string;
  readonly source_message_text: string;
  readonly status: FamilyJournalEntry["status"];
  readonly occurred_at: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteFamilyJournalRepository
  implements FamilyJournalRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async saveFamilyJournalEntry(entry: FamilyJournalEntry): Promise<void> {
    this.database
      .prepare(
        `
          insert into family_journal_entries (
            id,
            category,
            body,
            subject_id,
            semantic_memory_entry_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            occurred_at,
            created_at,
            updated_at
          )
          values (
            @id,
            @category,
            @body,
            @subjectId,
            @semanticMemoryEntryId,
            @sourceActorId,
            @sourceChatId,
            @sourceMessageText,
            @status,
            @occurredAt,
            @createdAt,
            @updatedAt
          )
          on conflict(id) do update set
            category = excluded.category,
            body = excluded.body,
            subject_id = excluded.subject_id,
            semantic_memory_entry_id = excluded.semantic_memory_entry_id,
            source_actor_id = excluded.source_actor_id,
            source_chat_id = excluded.source_chat_id,
            source_message_text = excluded.source_message_text,
            status = excluded.status,
            occurred_at = excluded.occurred_at,
            updated_at = excluded.updated_at
        `
      )
      .run({
        id: entry.id,
        category: entry.category,
        body: entry.body,
        subjectId: entry.subjectId ?? null,
        semanticMemoryEntryId: entry.semanticMemoryEntryId ?? null,
        sourceActorId: entry.sourceActorId,
        sourceChatId: entry.sourceChatId,
        sourceMessageText: entry.sourceMessageText,
        status: entry.status,
        occurredAt: entry.occurredAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString()
      });
  }

  async listRecentActiveFamilyJournalEntries(
    limit: number
  ): Promise<readonly FamilyJournalEntry[]> {
    const rows = this.database
      .prepare(
        `
          select
            id,
            category,
            body,
            subject_id,
            semantic_memory_entry_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            occurred_at,
            created_at,
            updated_at
          from family_journal_entries
          where status = 'active'
          order by occurred_at desc, created_at desc
          limit ?
        `
      )
      .all(limit) as FamilyJournalEntryRow[];

    return rows.map(toFamilyJournalEntry);
  }

  async findFamilyJournalEntryById(
    id: string
  ): Promise<FamilyJournalEntry | undefined> {
    const row = this.database
      .prepare(
        `
          select
            id,
            category,
            body,
            subject_id,
            semantic_memory_entry_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            occurred_at,
            created_at,
            updated_at
          from family_journal_entries
          where id = ?
        `
      )
      .get(id) as FamilyJournalEntryRow | undefined;

    return row ? toFamilyJournalEntry(row) : undefined;
  }
}

function toFamilyJournalEntry(
  row: FamilyJournalEntryRow
): FamilyJournalEntry {
  return {
    id: row.id,
    category: row.category,
    body: row.body,
    ...(row.subject_id ? { subjectId: row.subject_id } : {}),
    ...(row.semantic_memory_entry_id
      ? { semanticMemoryEntryId: row.semantic_memory_entry_id }
      : {}),
    sourceActorId: row.source_actor_id,
    sourceChatId: row.source_chat_id,
    sourceMessageText: row.source_message_text,
    status: row.status,
    occurredAt: new Date(row.occurred_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
