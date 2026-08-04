import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

interface ShoppingItemRow {
  readonly id: string;
  readonly title: string;
  readonly store_hint: string | null;
  readonly project_tag: string | null;
  readonly tags_json: string;
  readonly semantic_memory_entry_id: string | null;
  readonly source_actor_id: string;
  readonly source_chat_id: string;
  readonly source_message_text: string;
  readonly status: ShoppingItem["status"];
  readonly created_at: string;
  readonly updated_at: string;
}

export class SqliteShoppingRepository implements ShoppingRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async saveShoppingItem(item: ShoppingItem): Promise<void> {
    this.database
      .prepare(
        `
          insert into shopping_items (
            id,
            title,
            store_hint,
            project_tag,
            tags_json,
            semantic_memory_entry_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            created_at,
            updated_at
          )
          values (
            @id,
            @title,
            @storeHint,
            @projectTag,
            @tagsJson,
            @semanticMemoryEntryId,
            @sourceActorId,
            @sourceChatId,
            @sourceMessageText,
            @status,
            @createdAt,
            @updatedAt
          )
          on conflict(id) do update set
            title = excluded.title,
            store_hint = excluded.store_hint,
            project_tag = excluded.project_tag,
            tags_json = excluded.tags_json,
            semantic_memory_entry_id = excluded.semantic_memory_entry_id,
            source_actor_id = excluded.source_actor_id,
            source_chat_id = excluded.source_chat_id,
            source_message_text = excluded.source_message_text,
            status = excluded.status,
            updated_at = excluded.updated_at
        `
      )
      .run({
        id: item.id,
        title: item.title,
        storeHint: item.storeHint ?? null,
        projectTag: item.projectTag ?? null,
        tagsJson: JSON.stringify(item.tags),
        semanticMemoryEntryId: item.semanticMemoryEntryId ?? null,
        sourceActorId: item.sourceActorId,
        sourceChatId: item.sourceChatId,
        sourceMessageText: item.sourceMessageText,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      });
  }

  async listRecentOpenShoppingItems(
    limit: number
  ): Promise<readonly ShoppingItem[]> {
    const rows = this.database
      .prepare(
        `
          select
            id,
            title,
            store_hint,
            project_tag,
            tags_json,
            semantic_memory_entry_id,
            source_actor_id,
            source_chat_id,
            source_message_text,
            status,
            created_at,
            updated_at
          from shopping_items
          where status = 'open'
          order by created_at desc
          limit ?
        `
      )
      .all(limit) as ShoppingItemRow[];

    return rows.map(toShoppingItem);
  }
}

function toShoppingItem(row: ShoppingItemRow): ShoppingItem {
  return {
    id: row.id,
    title: row.title,
    ...(row.store_hint ? { storeHint: row.store_hint } : {}),
    ...(row.project_tag ? { projectTag: row.project_tag } : {}),
    tags: parseTags(row.tags_json),
    ...(row.semantic_memory_entry_id
      ? { semanticMemoryEntryId: row.semantic_memory_entry_id }
      : {}),
    sourceActorId: row.source_actor_id,
    sourceChatId: row.source_chat_id,
    sourceMessageText: row.source_message_text,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function parseTags(tagsJson: string): readonly string[] {
  try {
    const parsed = JSON.parse(tagsJson) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}
