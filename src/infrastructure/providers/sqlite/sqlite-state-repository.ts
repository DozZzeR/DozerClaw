import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { DocumentRecord } from "../../../core/domain/documents/document-record.js";
import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type {
  LastOperationContext,
  PendingClarification,
  PendingDocumentDecision,
  PendingDocumentPlacementDecision,
  PendingFamilyFactArchiveDecision,
  PendingFamilyFactDecision,
  PendingFileDestinationDecision,
  PendingFileDuplicateDecision,
  PendingShoppingItemDecision,
  StateRepositoryPort
} from "../../../ports/state-repository-port.js";
import type { SqliteDatabase } from "./sqlite-database.js";

const EXPIRING_STATE_TABLES = [
  "last_operation_contexts",
  "pending_clarifications",
  "pending_file_duplicate_decisions",
  "pending_file_destination_decisions",
  "pending_family_fact_decisions",
  "pending_family_fact_archive_decisions",
  "pending_shopping_item_decisions",
  "pending_document_decisions",
  "pending_document_placement_decisions"
] as const;

/**
 * Physically remove expired pending-state rows. Reads already ignore rows past
 * `expires_at`, but nothing deleted them, so stale sensitive context lingered on
 * disk. Safe to run at startup; returns the number of rows removed. See
 * DC-LOW-003.
 */
export function purgeExpiredState(database: SqliteDatabase, now: Date): number {
  const cutoff = now.toISOString();

  const purge = database.transaction((iso: string): number => {
    let removed = 0;

    for (const table of EXPIRING_STATE_TABLES) {
      removed += database
        .prepare(`delete from ${table} where expires_at < ?`)
        .run(iso).changes;
    }

    return removed;
  });

  return purge(cutoff);
}

/**
 * Raised when a stored JSON payload cannot be parsed (a corrupt or truncated
 * row). Carries the column context but never the raw payload, which may contain
 * sensitive family data. See DC-LOW-002.
 */
export class StateDataError extends Error {
  constructor(context: string, cause: unknown) {
    super(`Corrupt stored JSON for ${context}`, { cause });
    this.name = "StateDataError";
  }
}

export function safeJsonParse(json: string, context: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch (error) {
    throw new StateDataError(context, error);
  }
}

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

  async findActiveLastOperationContext(
    chatId: string,
    actorId: string,
    now: Date
  ): Promise<LastOperationContext | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            operation_kind as operationKind,
            entity_kind as entityKind,
            entity_id as entityId,
            entity_label as entityLabel,
            document_json as documentJson,
            created_at as createdAt,
            expires_at as expiresAt
          from last_operation_contexts
          where chat_id = ? and actor_id = ? and expires_at > ?
        `
      )
      .get(
        chatId,
        actorId,
        now.toISOString()
      ) as LastOperationContextRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      operationKind: row.operationKind,
      entityKind: row.entityKind,
      entityId: row.entityId,
      ...(row.entityLabel ? { entityLabel: row.entityLabel } : {}),
      ...(row.documentJson ? { document: parseDocument(row.documentJson) } : {}),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async saveLastOperationContext(
    input: LastOperationContext
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into last_operation_contexts (
            chat_id,
            actor_id,
            operation_kind,
            entity_kind,
            entity_id,
            entity_label,
            document_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          on conflict(chat_id, actor_id) do update set
            operation_kind = excluded.operation_kind,
            entity_kind = excluded.entity_kind,
            entity_id = excluded.entity_id,
            entity_label = excluded.entity_label,
            document_json = excluded.document_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        input.operationKind,
        input.entityKind,
        input.entityId,
        input.entityLabel ?? null,
        input.document ? JSON.stringify(documentRecordToJson(input.document)) : null,
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearLastOperationContext(
    chatId: string,
    actorId: string
  ): Promise<void> {
    this.database
      .prepare(
        "delete from last_operation_contexts where chat_id = ? and actor_id = ?"
      )
      .run(chatId, actorId);
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

  async findActivePendingFileDestinationDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDestinationDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            provider,
            received_at as receivedAt,
            attachments_json as attachmentsJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_file_destination_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingFileDestinationDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      provider: row.provider,
      receivedAt: new Date(row.receivedAt),
      attachments: parseAttachments(row.attachmentsJson),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingFileDestinationDecision(
    input: PendingFileDestinationDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_file_destination_decisions (
            chat_id,
            actor_id,
            provider,
            received_at,
            attachments_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            provider = excluded.provider,
            received_at = excluded.received_at,
            attachments_json = excluded.attachments_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        input.provider,
        input.receivedAt.toISOString(),
        JSON.stringify(input.attachments),
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingFileDestinationDecisionByChatId(
    chatId: string
  ): Promise<void> {
    this.database
      .prepare("delete from pending_file_destination_decisions where chat_id = ?")
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

  async findActivePendingShoppingItemDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingShoppingItemDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            action,
            candidates_json as candidatesJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_shopping_item_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingShoppingItemDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      action: row.action,
      candidates: parseShoppingItems(row.candidatesJson),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingShoppingItemDecision(
    input: PendingShoppingItemDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_shopping_item_decisions (
            chat_id,
            actor_id,
            action,
            candidates_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            action = excluded.action,
            candidates_json = excluded.candidates_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        input.action,
        JSON.stringify(input.candidates.map(shoppingItemToJson)),
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingShoppingItemDecisionByChatId(
    chatId: string
  ): Promise<void> {
    this.database
      .prepare("delete from pending_shopping_item_decisions where chat_id = ?")
      .run(chatId);
  }

  async findActivePendingDocumentDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            action_json as actionJson,
            candidates_json as candidatesJson,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_document_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as PendingDocumentDecisionRow | undefined;

    if (!row) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      action: safeJsonParse(
        row.actionJson,
        "pending_document_decisions.action_json"
      ) as PendingDocumentDecision["action"],
      candidates: parseDocumentRecords(row.candidatesJson),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingDocumentDecision(
    input: PendingDocumentDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_document_decisions (
            chat_id,
            actor_id,
            action_json,
            candidates_json,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            action_json = excluded.action_json,
            candidates_json = excluded.candidates_json,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        JSON.stringify(input.action),
        JSON.stringify(input.candidates.map(documentRecordToJson)),
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingDocumentDecisionByChatId(chatId: string): Promise<void> {
    this.database
      .prepare("delete from pending_document_decisions where chat_id = ?")
      .run(chatId);
  }

  async findActivePendingDocumentPlacementDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentPlacementDecision | undefined> {
    const row = this.database
      .prepare(
        `
          select
            chat_id as chatId,
            actor_id as actorId,
            document_json as documentJson,
            target_folder_path as targetFolderPath,
            target_folder_id as targetFolderId,
            created_at as createdAt,
            expires_at as expiresAt
          from pending_document_placement_decisions
          where chat_id = ? and expires_at > ?
        `
      )
      .get(chatId, now.toISOString()) as
      | PendingDocumentPlacementDecisionRow
      | undefined;

    if (!row) {
      return undefined;
    }

    const [document] = parseDocumentRecords(`[${row.documentJson}]`);

    if (!document) {
      return undefined;
    }

    return {
      chatId: row.chatId,
      actorId: row.actorId,
      document,
      targetFolderPath: row.targetFolderPath,
      ...(row.targetFolderId ? { targetFolderId: row.targetFolderId } : {}),
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt)
    };
  }

  async savePendingDocumentPlacementDecision(
    input: PendingDocumentPlacementDecision
  ): Promise<void> {
    this.database
      .prepare(
        `
          insert into pending_document_placement_decisions (
            chat_id,
            actor_id,
            document_json,
            target_folder_path,
            target_folder_id,
            created_at,
            expires_at
          )
          values (?, ?, ?, ?, ?, ?, ?)
          on conflict(chat_id) do update set
            actor_id = excluded.actor_id,
            document_json = excluded.document_json,
            target_folder_path = excluded.target_folder_path,
            target_folder_id = excluded.target_folder_id,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at
        `
      )
      .run(
        input.chatId,
        input.actorId,
        JSON.stringify(documentRecordToJson(input.document)),
        input.targetFolderPath,
        input.targetFolderId ?? null,
        input.createdAt.toISOString(),
        input.expiresAt.toISOString()
      );
  }

  async clearPendingDocumentPlacementDecisionByChatId(
    chatId: string
  ): Promise<void> {
    this.database
      .prepare(
        "delete from pending_document_placement_decisions where chat_id = ?"
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

interface LastOperationContextRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly operationKind: LastOperationContext["operationKind"];
  readonly entityKind: LastOperationContext["entityKind"];
  readonly entityId: string;
  readonly entityLabel: string | null;
  readonly documentJson: string | null;
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

interface PendingFileDestinationDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly provider: string;
  readonly receivedAt: string;
  readonly attachmentsJson: string;
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

interface PendingShoppingItemDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly action: PendingShoppingItemDecision["action"];
  readonly candidatesJson: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

interface PendingDocumentDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly actionJson: string;
  readonly candidatesJson: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

interface PendingDocumentPlacementDecisionRow {
  readonly chatId: string;
  readonly actorId: string;
  readonly documentJson: string;
  readonly targetFolderPath: string;
  readonly targetFolderId: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
}

function parseAttachments(json: string): readonly MessageAttachment[] {
  const parsed = safeJsonParse(json, "pending_state.attachments");

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
  const parsed = safeJsonParse(json, "pending_state.family_fact_candidates");

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value) => {
    const fact = parseFamilyFactValue(value);

    return fact ? [fact] : [];
  });
}

function parseDocumentRecords(json: string): readonly DocumentRecord[] {
  const parsed = safeJsonParse(json, "pending_state.document_records");

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.provider !== "string" ||
      typeof value.externalId !== "string" ||
      typeof value.name !== "string" ||
      typeof value.url !== "string" ||
      typeof value.status !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string"
    ) {
      return [];
    }

    const baseDocument = {
      id: value.id,
      provider: value.provider as DocumentRecord["provider"],
      externalId: value.externalId,
      name: value.name,
      url: value.url,
      ...(typeof value.semanticMemoryEntryId === "string"
        ? { semanticMemoryEntryId: value.semanticMemoryEntryId }
        : {}),
      status: value.status as DocumentRecord["status"],
      createdAt: new Date(value.createdAt),
      updatedAt: new Date(value.updatedAt)
    };

    if (
      typeof value.documentType === "string" &&
      typeof value.subjectId === "string"
    ) {
      return [
        {
          ...baseDocument,
          documentType: value.documentType as DocumentRecord["documentType"],
          subjectId: value.subjectId
        }
      ];
    }

    if (typeof value.documentType === "string") {
      return [
        {
          ...baseDocument,
          documentType: value.documentType as DocumentRecord["documentType"]
        }
      ];
    }

    if (typeof value.subjectId === "string") {
      return [
        {
          ...baseDocument,
          subjectId: value.subjectId
        }
      ];
    }

    return [baseDocument];
  });
}

function parseDocument(json: string): DocumentRecord {
  const document = parseDocumentRecords(`[${json}]`)[0];

  if (!document) {
    throw new Error("Invalid last operation document payload");
  }

  return document;
}

function documentRecordToJson(document: DocumentRecord): Record<string, unknown> {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString()
  };
}

function parseShoppingItems(json: string): readonly ShoppingItem[] {
  const parsed = safeJsonParse(json, "pending_state.shopping_items");

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== "string" ||
      typeof value.title !== "string" ||
      !Array.isArray(value.tags) ||
      typeof value.sourceActorId !== "string" ||
      typeof value.sourceChatId !== "string" ||
      typeof value.sourceMessageText !== "string" ||
      typeof value.status !== "string" ||
      typeof value.createdAt !== "string" ||
      typeof value.updatedAt !== "string"
    ) {
      return [];
    }

    return [
      {
        id: value.id,
        title: value.title,
        ...(typeof value.storeHint === "string"
          ? { storeHint: value.storeHint }
          : {}),
        ...(typeof value.projectTag === "string"
          ? { projectTag: value.projectTag }
          : {}),
        tags: value.tags.filter((tag): tag is string => typeof tag === "string"),
        ...(typeof value.semanticMemoryEntryId === "string"
          ? { semanticMemoryEntryId: value.semanticMemoryEntryId }
          : {}),
        sourceActorId: value.sourceActorId,
        sourceChatId: value.sourceChatId,
        sourceMessageText: value.sourceMessageText,
        status: value.status as ShoppingItem["status"],
        createdAt: new Date(value.createdAt),
        updatedAt: new Date(value.updatedAt)
      }
    ];
  });
}

function shoppingItemToJson(item: ShoppingItem): Record<string, unknown> {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function parseFamilyFact(json: string): FamilyFact {
  const fact = parseFamilyFactValue(
    safeJsonParse(json, "last_operation.family_fact")
  );

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
