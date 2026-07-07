import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface FamilyFactRow {
  readonly id: string;
  readonly category: FamilyFact["category"];
  readonly body: string;
  readonly subject_id: string | null;
  readonly source_actor_id: string;
  readonly source_chat_id: string;
  readonly source_message_text: string;
  readonly status: FamilyFact["status"];
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteFamilyMemoryRepository
  implements FamilyMemoryRepositoryPort
{
  constructor(private readonly database: SqliteDatabase) {}

  async saveFamilyFact(fact: FamilyFact): Promise<void> {
    this.database
      .prepare(
        `
          insert into family_facts (
            id,
            category,
            body,
            subject_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            created_at,
            updated_at
          )
          values (
            @id,
            @category,
            @body,
            @subjectId,
            @sourceActorId,
            @sourceChatId,
            @sourceMessageText,
            @status,
            @createdAt,
            @updatedAt
          )
          on conflict(id) do update set
            category = excluded.category,
            body = excluded.body,
            subject_id = excluded.subject_id,
            source_actor_id = excluded.source_actor_id,
            source_chat_id = excluded.source_chat_id,
            source_message_text = excluded.source_message_text,
            status = excluded.status,
            updated_at = excluded.updated_at
        `
      )
      .run({
        id: fact.id,
        category: fact.category,
        body: fact.body,
        subjectId: fact.subjectId ?? null,
        sourceActorId: fact.sourceActorId,
        sourceChatId: fact.sourceChatId,
        sourceMessageText: fact.sourceMessageText,
        status: fact.status,
        createdAt: fact.createdAt.toISOString(),
        updatedAt: fact.updatedAt.toISOString()
      });
  }

  async listRecentActiveFamilyFacts(
    limit: number
  ): Promise<readonly FamilyFact[]> {
    const rows = this.database
      .prepare(
        `
          select
            id,
            category,
            body,
            subject_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            created_at,
            updated_at
          from family_facts
          where status = 'active'
          order by created_at desc
          limit ?
        `
      )
      .all(limit) as FamilyFactRow[];

    return rows.map(toFamilyFact);
  }
}

function toFamilyFact(row: FamilyFactRow): FamilyFact {
  return {
    id: row.id,
    category: row.category,
    body: row.body,
    ...(row.subject_id ? { subjectId: row.subject_id } : {}),
    sourceActorId: row.source_actor_id,
    sourceChatId: row.source_chat_id,
    sourceMessageText: row.source_message_text,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
