import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type {
  PendingClarification,
  StateRepositoryPort
} from "../../../ports/state-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

export class SqliteStateRepository implements StateRepositoryPort {
  constructor(private readonly database: SqliteDatabase) {}

  async healthCheck() {
    try {
      this.database.prepare("select 1").get();

      return {
        ok: true,
        detail: "SQLite reachable"
      };
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : "SQLite unreachable"
      };
    }
  }

  async findActivePendingClarificationByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingClarification | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            original_text as originalText,
            original_attachments_json as originalAttachmentsJson,
            question,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_clarifications
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as PendingClarificationRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      originalText: row.originalText,
      originalAttachments: parseAttachments(row.originalAttachmentsJson),
      question: row.question,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingClarification(input: PendingClarification): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_clarifications (
            chat_id,
            actor_id,
            original_text,
            original_attachments_json,
            question,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            original_text = excluded.original_text,
            original_attachments_json = excluded.original_attachments_json,
            question = excluded.question,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        input.originalText,
        JSON.stringify(input.originalAttachments),
        input.question,
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingClarificationByChatId(chatId: string): Promise<void> {
    this.database
      .prepare("delete from pending_clarifications where chat_id = ?")
      .run(chatId);
  }
}

interface PendingClarificationRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly originalText: string;
  readonly originalAttachmentsJson: string;
  readonly question: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

function parseAttachments(json: string): readonly MessageAttachment[] {
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string") {
      return [];
    }

    return [
      {
        id: value.id,
        ...(typeof value.providerFileId === "string"
          ? { providerFileId: value.providerFileId }
          : {}),
        ...(typeof value.fileName === "string" ? { fileName: value.fileName } : {}),
        ...(typeof value.mimeType === "string" ? { mimeType: value.mimeType } : {}),
        ...(typeof value.sizeBytes === "number"
          ? { sizeBytes: value.sizeBytes }
          : {})
      }
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
