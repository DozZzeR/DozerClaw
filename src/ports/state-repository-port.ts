import type { MessageAttachment } from "../core/domain/messaging/message.js";
import type { DocumentRecord } from "../core/domain/documents/document-record.js";
import type { DocumentType } from "../core/domain/documents/document-record.js";
import type { FamilyFact } from "../core/domain/family-memory/family-fact.js";

export interface StateRepositoryPort {
  healthCheck(): Promise<StateRepositoryHealth>;
  findActivePendingClarificationByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingClarification | undefined>;
  savePendingClarification(input: PendingClarification): Promise<void>;
  clearPendingClarificationByChatId(chatId: string): Promise<void>;
  findActivePendingFileDuplicateDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDuplicateDecision | undefined>;
  savePendingFileDuplicateDecision(
    input: PendingFileDuplicateDecision
  ): Promise<void>;
  clearPendingFileDuplicateDecisionByChatId(chatId: string): Promise<void>;
  findActivePendingFileDestinationDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDestinationDecision | undefined>;
  savePendingFileDestinationDecision(
    input: PendingFileDestinationDecision
  ): Promise<void>;
  clearPendingFileDestinationDecisionByChatId(chatId: string): Promise<void>;
  findActivePendingFamilyFactDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactDecision | undefined>;
  savePendingFamilyFactDecision(
    input: PendingFamilyFactDecision
  ): Promise<void>;
  clearPendingFamilyFactDecisionByChatId(chatId: string): Promise<void>;
  findActivePendingFamilyFactArchiveDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactArchiveDecision | undefined>;
  savePendingFamilyFactArchiveDecision(
    input: PendingFamilyFactArchiveDecision
  ): Promise<void>;
  clearPendingFamilyFactArchiveDecisionByChatId(chatId: string): Promise<void>;
  findActivePendingDocumentDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentDecision | undefined>;
  savePendingDocumentDecision(input: PendingDocumentDecision): Promise<void>;
  clearPendingDocumentDecisionByChatId(chatId: string): Promise<void>;
  findActivePendingDocumentPlacementDecisionByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentPlacementDecision | undefined>;
  savePendingDocumentPlacementDecision(
    input: PendingDocumentPlacementDecision
  ): Promise<void>;
  clearPendingDocumentPlacementDecisionByChatId(chatId: string): Promise<void>;
}

export interface StateRepositoryHealth {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface PendingClarification {
  readonly chatId: string;
  readonly actorId: string;
  readonly originalText: string;
  readonly originalAttachments: readonly MessageAttachment[];
  readonly question: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PendingFileDuplicateDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly fileName: string;
  readonly suggestedCopyName: string;
  readonly existingRecordId: string;
  readonly provider?: string;
  readonly receivedAt?: Date;
  readonly sourceAttachment?: MessageAttachment;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PendingFileDestinationDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly provider: string;
  readonly receivedAt: Date;
  readonly attachments: readonly MessageAttachment[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PendingFamilyFactDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly newFact: FamilyFact;
  readonly candidates: readonly FamilyFact[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PendingFamilyFactArchiveDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly candidates: readonly FamilyFact[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export type PendingDocumentDecisionAction =
  | {
      readonly kind: "update_metadata";
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "archive";
    }
  | {
      readonly kind: "describe_for_search";
    };

export interface PendingDocumentDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly action: PendingDocumentDecisionAction;
  readonly candidates: readonly DocumentRecord[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface PendingDocumentPlacementDecision {
  readonly chatId: string;
  readonly actorId: string;
  readonly document: DocumentRecord;
  readonly targetFolderPath: string;
  readonly targetFolderId?: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}
