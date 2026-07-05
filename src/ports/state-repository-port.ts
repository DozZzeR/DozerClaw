import type { MessageAttachment } from "../core/domain/messaging/message.js";

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
  readonly createdAt: Date;
  readonly expiresAt: Date;
}
