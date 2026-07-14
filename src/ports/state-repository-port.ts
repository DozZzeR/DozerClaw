import type { MessageAttachment } from "../core/domain/messaging/message.js";
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
