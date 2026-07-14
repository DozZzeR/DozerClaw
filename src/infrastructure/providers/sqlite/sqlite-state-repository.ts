import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type {
  PendingClarification,
  PendingFamilyFactArchiveDecision,
  PendingFamilyFactDecision,
  PendingFileDuplicateDecision,
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

  async findActivePendingFileDuplicateDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDuplicateDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            file_name as fileName,
            suggested_copy_name as suggestedCopyName,
            existing_record_id as existingRecordId,
            provider,
            received_at as receivedAt,
            source_attachment_json as sourceAttachmentJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_file_duplicate_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingFileDuplicateDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    const sourceAttachment = row.sourceAttachmentJson
      ? parseAttachment(row.sourceAttachmentJson)
      : undefined;

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      fileName: row.fileName,
      suggestedCopyName: row.suggestedCopyName,
      existingRecordId: row.existingRecordId,
      ...(row.provider ? { provider: row.provider } : {}),
      ...(row.receivedAt ? { receivedAt: new Date(row.receivedAt) } : {}),
      ...(sourceAttachment ? { sourceAttachment } : {}),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingFileDuplicateDecision(
    input: PendingFileDuplicateDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_file_duplicate_decisions (
            chat_id,
            actor_id,
            file_name,
            suggested_copy_name,
            existing_record_id,
            provider,
            received_at,
            source_attachment_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            file_name = excluded.file_name,
            suggested_copy_name = excluded.suggested_copy_name,
            existing_record_id = excluded.existing_record_id,
            provider = excluded.provider,
            received_at = excluded.received_at,
            source_attachment_json = excluded.source_attachment_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        input.fileName,
        input.suggestedCopyName,
        input.existingRecordId,
        input.provider ?? null,
        input.receivedAt?.toISOString() ?? null,
        input.sourceAttachment ? JSON.stringify(input.sourceAttachment) : null,
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingFileDuplicateDecisionByChatId(
    chatId: string
  ): Promise<void> {
    this.database
      .prepare("delete from pending_file_duplicate_decisions where chat_id = ?")
      .run(chatId);
  }

  async findActivePendingFamilyFactDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            new_fact_json as newFactJson,
            candidates_json as candidatesJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_family_fact_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingFamilyFactDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      newFact: parseFamilyFact(row.newFactJson),
      candidates: parseFamilyFacts(row.candidatesJson),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingFamilyFactDecision(
    input: PendingFamilyFactDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_family_fact_decisions (
            chat_id,
            actor_id,
            new_fact_json,
            candidates_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            new_fact_json = excluded.new_fact_json,
            candidates_json = excluded.candidates_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        JSON.stringify(familyFactToJson(input.newFact)),
        JSON.stringify(input.candidates.map(familyFactToJson)),
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingFamilyFactDecisionByChatId(chatId: string): Promise<void> {
    this.database
      .prepare("delete from pending_family_fact_decisions where chat_id = ?")
      .run(chatId);
  }

  async findActivePendingFamilyFactArchiveDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactArchiveDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            candidates_json as candidatesJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_family_fact_archive_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingFamilyFactArchiveDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      candidates: parseFamilyFacts(row.candidatesJson),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingFamilyFactArchiveDecision(
    input: PendingFamilyFactArchiveDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_family_fact_archive_decisions (
            chat_id,
            actor_id,
            candidates_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            candidates_json = excluded.candidates_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        JSON.stringify(input.candidates.map(familyFactToJson)),
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingFamilyFactArchiveDecisionByChatId(
    chatId: string
  ): Promise<void> {
    this.database
      .prepare(
        "delete from pending_family_fact_archive_decisions where chat_id = ?"
      )
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

interface PendingFileDuplicateDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly fileName: string;
  readonly suggestedCopyName: string;
  readonly existingRecordId: string;
  readonly provider: string | null;
  readonly receivedAt: string | null;
  readonly sourceAttachmentJson: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
}

interface PendingFamilyFactDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly newFactJson: string;
  readonly candidatesJson: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

interface PendingFamilyFactArchiveDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly candidatesJson: string;
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

function parseAttachment(json: string): MessageAttachment | undefined {
  return parseAttachments(`[${json}]`)[0];
}

function familyFactToJson(fact: FamilyFact): Record<string, unknown> {
  return {
    ...fact,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString()
  };
}

function parseFamilyFacts(json: string): readonly FamilyFact[] {
  const parsed = JSON.parse(json) as unknown;

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value) => {
    const fact = parseFamilyFactValue(value);

    return fact ? [fact] : [];
  });
}

function parseFamilyFact(json: string): FamilyFact {
  const fact = parseFamilyFactValue(JSON.parse(json) as unknown);

  if (!fact) {
    throw new Error("Invalid pending family fact payload");
  }

  return fact;
}

function parseFamilyFactValue(value: unknown): FamilyFact | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.category !== "string" ||
    typeof value.body !== "string" ||
    typeof value.sourceActorId !== "string" ||
    typeof value.sourceChatId !== "string" ||
    typeof value.sourceMessageText !== "string" ||
    typeof value.status !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return undefined;
  }

  return {
    id: value.id,
    category: value.category as FamilyFact["category"],
    body: value.body,
    ...(typeof value.subjectId === "string" ? { subjectId: value.subjectId } : {}),
    sourceActorId: value.sourceActorId,
    sourceChatId: value.sourceChatId,
    sourceMessageText: value.sourceMessageText,
    status: value.status as FamilyFact["status"],
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt)
  };
}
