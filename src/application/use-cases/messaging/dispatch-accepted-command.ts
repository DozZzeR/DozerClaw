import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
export type { DuplicateDecision } from "./dispatch-command-helpers.js";
import type { AccessAction } from "../../../core/domain/identity/access-policy.js";
import { evaluateAccess } from "../../../core/domain/identity/access-policy.js";
import type {
  DocumentType
} from "../../../core/domain/documents/document-record.js";
import type {
  RegisterDocumentInput,
  RegisterDocumentResult
} from "../documents/register-document.js";
import type {
  FindDocumentsInput,
  FindDocumentsResult
} from "../documents/find-documents.js";
import type {
  ManageDocumentRecordInput,
  ManageDocumentRecordResult
} from "../documents/manage-document-record.js";
import type {
  StoreMessageDocumentAttachmentResult,
  StoreMessageDocumentAttachmentsInput
} from "../documents/store-message-document-attachments.js";
import type { UploadPreparedDocumentInput } from "../documents/store-message-document-attachments.js";
import type {
  RecordDocumentSearchDescriptionInput,
  RecordDocumentSearchDescriptionResult
} from "../documents/record-document-search-description.js";
import type {
  ProcessReceiptWarrantyUploadInput,
  ProcessReceiptWarrantyUploadResult
} from "../documents/process-receipt-warranty-upload.js";
import type {
  UploadFileInboxDocumentInput,
  UploadFileInboxDocumentResult
} from "../documents/upload-file-inbox-document.js";
import type { PendingAccessRequest } from "../../../ports/identity-access-repository-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../ports/state-repository-port.js";
import type { PendingClarification } from "../../../ports/state-repository-port.js";
import type { PendingDocumentDecision } from "../../../ports/state-repository-port.js";
import type { PendingDocumentPlacementDecision } from "../../../ports/state-repository-port.js";
import type { PendingFamilyFactArchiveDecision } from "../../../ports/state-repository-port.js";
import type { PendingFamilyFactDecision } from "../../../ports/state-repository-port.js";
import type { PendingFileDestinationDecision } from "../../../ports/state-repository-port.js";
import type { PendingFileDuplicateDecision } from "../../../ports/state-repository-port.js";
import type { PendingShoppingItemDecision } from "../../../ports/state-repository-port.js";
import type { StoreInboundFileResult } from "../file-inbox/store-inbound-file.js";
import type { RecallFamilyJournalEntriesInput } from "../family-journal/recall-family-journal-entries.js";
import type {
  RecordFamilyJournalEntryInput,
  RecordFamilyJournalEntryResult
} from "../family-journal/record-family-journal-entry.js";
import type { RecallFamilyFactsInput } from "../family-memory/recall-family-facts.js";
import type {
  ArchiveFamilyFactInput,
  ArchiveFamilyFactResult
} from "../family-memory/archive-family-fact.js";
import type {
  ManageSubjectAliasesInput,
  ManageSubjectAliasesResult
} from "../family-memory/manage-subject-aliases.js";
import type {
  FamilyFactDecision,
  ResolveFamilyFactDecisionInput,
  ResolveFamilyFactDecisionResult
} from "../family-memory/resolve-family-fact-decision.js";
import type {
  RecordFamilyFactInput,
  RecordFamilyFactResult
} from "../family-memory/record-family-fact.js";
import type {
  UpdateFamilyFactInput,
  UpdateFamilyFactResult
} from "../family-memory/update-family-fact.js";
import type {
  UpdateFamilyJournalEntryInput,
  UpdateFamilyJournalEntryResult
} from "../family-journal/update-family-journal-entry.js";
import type {
  ShoppingRecorder,
  ShoppingRecall,
  ShoppingManager,
  ShoppingItemDecision
} from "../shopping/dispatch-shopping-request.js";
import {
  DispatchShoppingRequestUseCase,
  isShoppingIntent,
  parseShoppingCommandRail
} from "../shopping/dispatch-shopping-request.js";
import type {
  FileDuplicateMutationDecision,
  ResolveFileDuplicateDecisionInput,
  ResolveFileDuplicateDecisionResult
} from "../file-inbox/resolve-file-duplicate-decision.js";
import type {
  InboundIntent,
  InboundIntentClassifier
} from "./classify-inbound-intent.js";
import type {
  PendingChoiceClassifier
} from "./classify-pending-choice.js";
import {
  allowsFreeFormPendingInterruption,
  resolvePendingDecision
} from "./resolve-pending-decision.js";
import type { PendingDecisionPolicy } from "./resolve-pending-decision.js";
import type {
  ActivateAdminSessionInput,
  ActivateAdminSessionResult
} from "../identity/activate-admin-session.js";
import type {
  PendingIdentityDecision,
  ReviewPendingIdentityResult
} from "../identity/review-pending-identity.js";
import type { StoreMessageAttachmentsInput } from "../file-inbox/store-message-attachments.js";
import type { HandleSystemHealthCommandInput } from "../health/handle-system-health-command.js";
import type { AcceptedMessageContext } from "./process-inbound-message.js";
import type { CommandRoute } from "./route-command.js";
import type {
  EventLogPort,
  OperationalEvent
} from "../../../ports/event-log-port.js";
import type {
  ManagePlanningTaskInput,
  ManagePlanningTaskResult
} from "../planning/manage-planning-task.js";
import type { NotificationRecord } from "../../../ports/notification-repository-port.js";
import {
  attachmentIoErrorMessage,
  buildClarificationClassifierText,
  buildPendingDocumentPlacementInterruptionClassifierText,
  buildPendingFileDestinationInterruptionClassifierText,
  canonicalDocumentFolderPath,
  canUseLocalFileStorage,
  commandRailsHelpText,
  documentFromLastOperation,
  documentPlacementDecisionPolicy,
  domainClarificationQuestion,
  duplicateAttachmentReply,
  duplicateDecisionOptions,
  duplicateDecisionPrompt,
  familyFactDecisionOptions,
  familyFactDecisionPrompt,
  fileDestinationDecisionPolicy,
  fileDestinationPrompt,
  formatDocumentSearchDescriptionResult,
  formatFamilyFactConfirmation,
  formatPlacementSuggestionLines,
  formatRegisteredDocumentReply,
  formatUploadedDocumentsReply,
  formatUploadFolderChoicePrompt,
  isUploadedDocumentMetadataDecision,
  mergeAttachments,
  mergeDocumentMetadata,
  parseActorId,
  parseAdminSecret,
  parseDocumentMetadata,
  parseDuplicateDecision,
  parseFamilyFactArchiveDecision,
  parseFamilyFactDecision,
  parseFileUploadDestination,
  parseModelDocumentMetadata,
  parseNotificationId,
  parsePlacementDecision,
  parseSkipDocumentMetadata,
  parseUploadFolderChoice,
  placementDecisionOptions,
  placementDecisionPrompt,
  planningDateFromIntent,
  requiredAccessActionForIntent,
  resolveFileUploadDestinationForModelIntent,
  scopedClassifierText,
  selectedUploadFolderMetadata,
  sourceAttachmentForDuplicate,
  suggestCopyName,
  toClassifierLastOperation,
  toSubjectAliasAction
} from "./dispatch-command-helpers.js";
import type {
  DuplicateDecision,
  FileUploadDestination,
  PendingDecisionChoice,
  PendingRoutingEventAttributes,
  PlacementDecision
} from "./dispatch-command-helpers.js";

export interface SystemHealthCommandHandler {
  execute(input: HandleSystemHealthCommandInput): Promise<OutboundReply>;
}

export interface MessageAttachmentStore {
  execute(
    input: StoreMessageAttachmentsInput
  ): Promise<readonly StoreInboundFileResult[]>;
}

export interface MessageDocumentAttachmentStore {
  execute(
    input: StoreMessageDocumentAttachmentsInput
  ): Promise<readonly StoreMessageDocumentAttachmentResult[]>;
  uploadPrepared(
    input: UploadPreparedDocumentInput
  ): Promise<Extract<StoreMessageDocumentAttachmentResult, { readonly status: "uploaded" }>>;
}

export interface FileInboxDocumentUploader {
  execute(
    input: UploadFileInboxDocumentInput
  ): Promise<UploadFileInboxDocumentResult>;
}

export interface DocumentSearchDescriptionRecorder {
  execute(
    input: RecordDocumentSearchDescriptionInput
  ): Promise<RecordDocumentSearchDescriptionResult>;
}

export interface ReceiptWarrantyUploadProcessor {
  execute(
    input: ProcessReceiptWarrantyUploadInput
  ): Promise<ProcessReceiptWarrantyUploadResult>;
}

export interface FamilyFactRecorder {
  execute(input: RecordFamilyFactInput): Promise<RecordFamilyFactResult>;
}

export interface FamilyFactUpdater {
  execute(input: UpdateFamilyFactInput): Promise<UpdateFamilyFactResult>;
}

export interface FamilyFactRecall {
  execute(input: RecallFamilyFactsInput): Promise<{ readonly text: string }>;
}

export interface FamilyJournalRecorder {
  execute(
    input: RecordFamilyJournalEntryInput
  ): Promise<RecordFamilyJournalEntryResult>;
}

export interface FamilyJournalUpdater {
  execute(
    input: UpdateFamilyJournalEntryInput
  ): Promise<UpdateFamilyJournalEntryResult>;
}

export interface FamilyJournalRecall {
  execute(
    input: RecallFamilyJournalEntriesInput
  ): Promise<{ readonly text: string }>;
}

export interface PlanningStateQuery {
  execute(input: {
    readonly query: string;
    readonly now?: Date;
  }): Promise<{ readonly text: string }>;
}

export interface PlanningTaskManager {
  execute(input: ManagePlanningTaskInput): Promise<ManagePlanningTaskResult>;
}

export interface FamilyFactArchiver {
  execute(input: ArchiveFamilyFactInput): Promise<ArchiveFamilyFactResult>;
}

export interface DocumentRegistrar {
  execute(input: RegisterDocumentInput): Promise<RegisterDocumentResult>;
}

export interface DocumentLookup {
  execute(input: FindDocumentsInput): Promise<FindDocumentsResult>;
}

export interface DocumentManager {
  execute(input: ManageDocumentRecordInput): Promise<ManageDocumentRecordResult>;
}

export interface DocumentPlacementMover {
  execute(input: {
    readonly externalId: string;
    readonly targetFolderId: string;
  }): Promise<void>;
}

export interface DocumentFolderResolver {
  findFolderIdByPath(path: string): string | undefined;
}

export interface SubjectAliasManager {
  execute(input: ManageSubjectAliasesInput): Promise<ManageSubjectAliasesResult>;
}

export interface FamilyFactDecisionResolver {
  execute(
    input: ResolveFamilyFactDecisionInput
  ): Promise<ResolveFamilyFactDecisionResult>;
}

export interface PendingAccessRequestReviewer {
  list(): Promise<readonly PendingAccessRequest[]>;
  review(input: {
    readonly actorId: string;
    readonly decision: PendingIdentityDecision;
  }): Promise<ReviewPendingIdentityResult>;
}

export interface NotificationInbox {
  listUnread(input: {
    readonly actorId: string;
  }): Promise<{ readonly notifications: readonly NotificationRecord[] }>;
  markRead(input: {
    readonly notificationId: string;
    readonly actorId: string;
  }): Promise<void>;
}

export interface AdminSessionActivator {
  execute(input: ActivateAdminSessionInput): Promise<ActivateAdminSessionResult>;
}

export interface PendingClarificationStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingClarification | undefined>;
  save(input: PendingClarification): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface FileDuplicateDecisionResolver {
  execute(
    input: ResolveFileDuplicateDecisionInput
  ): Promise<ResolveFileDuplicateDecisionResult>;
}

export interface PendingFileDuplicateDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDuplicateDecision | undefined>;
  save(input: PendingFileDuplicateDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingFileDestinationDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDestinationDecision | undefined>;
  save(input: PendingFileDestinationDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingFamilyFactDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactDecision | undefined>;
  save(input: PendingFamilyFactDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingFamilyFactArchiveDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactArchiveDecision | undefined>;
  save(input: PendingFamilyFactArchiveDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingShoppingItemDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingShoppingItemDecision | undefined>;
  save(input: PendingShoppingItemDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingDocumentDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentDecision | undefined>;
  save(input: PendingDocumentDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingDocumentPlacementDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingDocumentPlacementDecision | undefined>;
  save(input: PendingDocumentPlacementDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface LastOperationStore {
  findActiveByChatAndActor(
    chatId: string,
    actorId: string,
    now: Date
  ): Promise<LastOperationContext | undefined>;
  save(input: LastOperationContext): Promise<void>;
  clear(chatId: string, actorId: string): Promise<void>;
}

export interface DispatchAcceptedCommandInput {
  readonly route: CommandRoute;
  readonly context: AcceptedMessageContext;
}

export interface DispatchAcceptedCommandDependencies {
  readonly systemHealthHandler: SystemHealthCommandHandler;
  readonly eventLog?: Pick<EventLogPort, "record">;
  readonly attachmentStore?: MessageAttachmentStore;
  readonly documentAttachmentStore?: MessageDocumentAttachmentStore;
  readonly fileInboxDocumentUploader?: FileInboxDocumentUploader;
  readonly documentSearchDescriptionRecorder?: DocumentSearchDescriptionRecorder;
  readonly receiptWarrantyUploadProcessor?: ReceiptWarrantyUploadProcessor;
  readonly familyFactRecorder?: FamilyFactRecorder;
  readonly familyFactUpdater?: FamilyFactUpdater;
  readonly familyFactRecall?: FamilyFactRecall;
  readonly familyJournalRecorder?: FamilyJournalRecorder;
  readonly familyJournalUpdater?: FamilyJournalUpdater;
  readonly familyJournalRecall?: FamilyJournalRecall;
  readonly shoppingRecorder?: ShoppingRecorder;
  readonly shoppingRecall?: ShoppingRecall;
  readonly shoppingManager?: ShoppingManager;
  readonly planningQuery?: PlanningStateQuery;
  readonly planningTaskManager?: PlanningTaskManager;
  readonly familyFactArchiver?: FamilyFactArchiver;
  readonly documentRegistrar?: DocumentRegistrar;
  readonly documentLookup?: DocumentLookup;
  readonly documentManager?: DocumentManager;
  readonly documentPlacementMover?: DocumentPlacementMover;
  readonly documentFolderResolver?: DocumentFolderResolver;
  readonly subjectAliasManager?: SubjectAliasManager;
  readonly factDecisionResolver?: FamilyFactDecisionResolver;
  readonly pendingAccessRequests?: PendingAccessRequestReviewer;
  readonly notifications?: NotificationInbox;
  readonly lastOperations?: LastOperationStore;
  readonly adminSessionActivator?: AdminSessionActivator;
  readonly intentClassifier?: InboundIntentClassifier;
  readonly pendingChoiceClassifier?: PendingChoiceClassifier<PendingDecisionChoice>;
  readonly duplicateDecisionResolver?: FileDuplicateDecisionResolver;
  readonly pendingClarifications?: PendingClarificationStore;
  readonly pendingFileDuplicateDecisions?: PendingFileDuplicateDecisionStore;
  readonly pendingFileDestinationDecisions?: PendingFileDestinationDecisionStore;
  readonly pendingFamilyFactDecisions?: PendingFamilyFactDecisionStore;
  readonly pendingFamilyFactArchiveDecisions?: PendingFamilyFactArchiveDecisionStore;
  readonly pendingShoppingItemDecisions?: PendingShoppingItemDecisionStore;
  readonly pendingDocumentDecisions?: PendingDocumentDecisionStore;
  readonly pendingDocumentPlacementDecisions?: PendingDocumentPlacementDecisionStore;
  readonly now?: () => Date;
  readonly timeZone?: string;
}

export class DispatchAcceptedCommandUseCase {
  constructor(
    private readonly dependencies: DispatchAcceptedCommandDependencies
  ) {}

  execute(input: DispatchAcceptedCommandInput): Promise<OutboundReply> {
    if (input.route.kind === "system_health") {
      return this.dependencies.systemHealthHandler.execute({
        chatId: input.context.chat.id
      });
    }

    if (input.route.kind === "start") {
      return Promise.resolve({
        chatId: input.context.chat.id,
        text: "You already have access."
      });
    }

    if (input.route.kind === "help") {
      return Promise.resolve({
        chatId: input.context.chat.id,
        text: commandRailsHelpText()
      });
    }

    if (input.route.kind === "pending_access_requests") {
      return this.listPendingAccessRequests(input.context.chat.id);
    }

    if (input.route.kind === "list_notifications") {
      return this.listUnreadNotifications(input.context);
    }

    if (input.route.kind === "mark_notification_read") {
      return this.markNotificationRead(input);
    }

    if (input.route.kind === "admin_mode_activate") {
      return this.activateAdminSession(input);
    }

    if (
      input.route.kind === "approve_access_request" ||
      input.route.kind === "reject_access_request"
    ) {
      return this.reviewPendingAccessRequest(input);
    }

    if (
      input.route.kind === "family_message" &&
      this.dependencies.intentClassifier
    ) {
      return this.dispatchModelIntent(input.context);
    }

    if (input.route.kind === "family_message") {
      return this.dispatchFamilyMessageWithoutModel(input.context);
    }

    return Promise.resolve({
      chatId: input.context.chat.id,
      text: `Command not implemented yet: ${input.route.kind}.`
    });
  }

  private async dispatchModelIntent(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    const now = this.dependencies.now?.() ?? new Date();
    const pendingReply = await this.dispatchDeterministicPendingDecision(
      context,
      now
    );

    if (pendingReply) {
      return pendingReply;
    }

    const commandRailReply = await this.dispatchCommandRail(context);
    if (commandRailReply) {
      return commandRailReply;
    }

    const pending =
      await this.dependencies.pendingClarifications?.findActiveByChatId(
        context.chat.id,
        now
      );
    const pendingDeniedReply = pending
      ? this.pendingActorDeniedReply(context, pending)
      : undefined;
    if (pendingDeniedReply) {
      return pendingDeniedReply;
    }
    const classifierInput = pending
      ? {
          text: buildClarificationClassifierText(pending, context.text),
          attachments: mergeAttachments(
            pending.originalAttachments,
            context.attachments
          )
        }
      : {
          text: scopedClassifierText(context.text),
          attachments: context.attachments
        };
    const lastOperation = pending
      ? undefined
      : await this.dependencies.lastOperations?.findActiveByChatAndActor(
          context.chat.id,
          context.actor.id,
          now
        );
    let intent: InboundIntent;
    try {
      intent = await this.dependencies.intentClassifier!.execute({
        text: classifierInput.text,
        attachments: classifierInput.attachments,
        ...(lastOperation
          ? { lastOperation: toClassifierLastOperation(lastOperation) }
          : {})
      });
    } catch {
      return this.dispatchModelFailure(context, classifierInput.attachments);
    }

    return this.dispatchClassifiedModelIntent({
      context,
      intent,
      pendingClarification: pending,
      lastOperation,
      attachments: classifierInput.attachments,
      allowFileOrClarification: true
    });
  }

  private async dispatchFamilyMessageWithoutModel(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    const now = this.dependencies.now?.() ?? new Date();
    const pendingReply = await this.dispatchDeterministicPendingDecision(
      context,
      now
    );

    if (pendingReply) {
      return pendingReply;
    }

    const commandRailReply = await this.dispatchCommandRail(context);
    if (commandRailReply) {
      return commandRailReply;
    }

    if (
      context.attachments.length > 0 &&
      (this.dependencies.attachmentStore ||
        this.dependencies.documentAttachmentStore)
    ) {
      return this.storeFamilyMessageAttachments(context);
    }

    return Promise.resolve({
      chatId: context.chat.id,
      text: "Command not implemented yet: family_message."
    });
  }

  private async dispatchDeterministicPendingDecision(
    context: AcceptedMessageContext,
    now: Date
  ): Promise<OutboundReply | undefined> {
    const pendingDestination =
      await this.dependencies.pendingFileDestinationDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDestination && context.attachments.length === 0) {
      return this.dispatchPendingFileDestinationDecision(
        context,
        pendingDestination
      );
    }

    const pendingPlacement =
      await this.dependencies.pendingDocumentPlacementDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingPlacement && context.attachments.length === 0) {
      return this.dispatchPendingDocumentPlacementDecision(
        context,
        pendingPlacement
      );
    }

    const pendingDuplicate =
      await this.dependencies.pendingFileDuplicateDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDuplicate && context.attachments.length === 0) {
      const destination = parseFileUploadDestination(context.text);

      if (destination) {
        return this.dispatchPendingDuplicateDestination(
          context,
          pendingDuplicate,
          destination
        );
      }

      return this.dispatchPendingDuplicateDecision(context, pendingDuplicate);
    }

    const pendingFamilyFact =
      await this.dependencies.pendingFamilyFactDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingFamilyFact && context.attachments.length === 0) {
      return this.dispatchPendingFamilyFactDecision(context, pendingFamilyFact);
    }

    const pendingFamilyFactArchive =
      await this.dependencies.pendingFamilyFactArchiveDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingFamilyFactArchive && context.attachments.length === 0) {
      return this.dispatchPendingFamilyFactArchiveDecision(
        context,
        pendingFamilyFactArchive
      );
    }

    const pendingShoppingItem =
      await this.dependencies.pendingShoppingItemDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingShoppingItem && context.attachments.length === 0) {
      return this.dispatchPendingShoppingItemDecision(
        context,
        pendingShoppingItem
      );
    }

    const pendingDocument =
      await this.dependencies.pendingDocumentDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDocument && context.attachments.length === 0) {
      return this.dispatchPendingDocumentDecision(context, pendingDocument);
    }

    return undefined;
  }

  private async dispatchModelFailure(
    context: AcceptedMessageContext,
    attachments: readonly MessageAttachment[]
  ): Promise<OutboundReply> {
    await this.dependencies.pendingClarifications?.clearByChatId(
      context.chat.id
    );

    if (attachments.length > 0 && this.dependencies.attachmentStore) {
      const reply = await this.storeFamilyMessageAttachments({
        ...context,
        attachments
      });

      return {
        chatId: context.chat.id,
        text: `${reply.text} Model routing is temporarily unavailable, so I could not classify it yet.`
      };
    }

    return {
      chatId: context.chat.id,
      text: "Model routing is temporarily unavailable. Please try again in a moment."
    };
  }

  private async dispatchCommandRail(
    context: AcceptedMessageContext
  ): Promise<OutboundReply | undefined> {
    const shoppingRail = parseShoppingCommandRail(context.text);
    if (shoppingRail) {
      const deniedReply = this.operationDeniedReply(context, shoppingRail.action);
      if (deniedReply) {
        return deniedReply;
      }

      return this.dispatchShoppingIntent(context, shoppingRail.intent);
    }

    return undefined;
  }

  private async recordFamilyFact(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "record_fact" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.familyFactRecorder) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.familyFactRecorder.execute({
      summary: intent.summary,
      ...(intent.category ? { category: intent.category } : {}),
      ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
      sourceActorId: context.actor.id,
      sourceChatId: context.chat.id,
      sourceMessageText: context.text
    });

    if (result.status === "needs_confirmation") {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingFamilyFactDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        newFact: result.newFact,
        candidates: result.candidates,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: formatFamilyFactConfirmation(result)
      };
    }

    await this.saveLastOperationContext(context, {
      operationKind: "family_fact_recorded",
      entityKind: "family_fact",
      entityId: result.fact.id,
      entityLabel: result.fact.body
    });

    return {
      chatId: context.chat.id,
      text: `Saved family fact: ${result.fact.body}`
    };
  }

  private dispatchShoppingIntent(
    context: AcceptedMessageContext,
    intent: Parameters<DispatchShoppingRequestUseCase["dispatchIntent"]>[1]
  ): Promise<OutboundReply> {
    return this.shoppingRequests().dispatchIntent(context, intent);
  }

  private shoppingRequests(): DispatchShoppingRequestUseCase {
    return new DispatchShoppingRequestUseCase({
      ...(this.dependencies.shoppingRecorder
        ? { shoppingRecorder: this.dependencies.shoppingRecorder }
        : {}),
      ...(this.dependencies.shoppingRecall
        ? { shoppingRecall: this.dependencies.shoppingRecall }
        : {}),
      ...(this.dependencies.shoppingManager
        ? { shoppingManager: this.dependencies.shoppingManager }
        : {}),
      ...(this.dependencies.pendingShoppingItemDecisions
        ? {
            pendingShoppingItemDecisions:
              this.dependencies.pendingShoppingItemDecisions
          }
        : {}),
      ...(this.dependencies.pendingChoiceClassifier
        ? {
            pendingChoiceClassifier: this.dependencies
              .pendingChoiceClassifier as PendingChoiceClassifier<ShoppingItemDecision>
          }
        : {}),
      ...(this.dependencies.now ? { now: this.dependencies.now } : {})
    });
  }

  private async recallFamilyFacts(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "answer_from_memory" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.familyFactRecall) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.familyFactRecall.execute({
      query: intent.query
    });

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async recordFamilyJournalEntry(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "record_journal_entry" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.familyJournalRecorder) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.familyJournalRecorder.execute({
      body: intent.summary,
      ...(intent.journalCategory ? { category: intent.journalCategory } : {}),
      ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
      sourceActorId: context.actor.id,
      sourceChatId: context.chat.id,
      sourceMessageText: context.text
    });
    await this.saveLastOperationContext(context, {
      operationKind: "family_journal_entry_recorded",
      entityKind: "family_journal_entry",
      entityId: result.entry.id,
      entityLabel: result.entry.body
    });

    return {
      chatId: context.chat.id,
      text: `Saved family journal entry: ${result.entry.body}`
    };
  }

  private async recallFamilyJournalEntries(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "recall_journal_entries" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.familyJournalRecall) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.familyJournalRecall.execute({
      query: intent.query
    });

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async queryPlanningState(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "query_planning" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.planningQuery) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.planningQuery.execute({
      query: intent.query,
      now: context.receivedAt
    });

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async managePlanningTask(
    context: AcceptedMessageContext,
    intent: Extract<
      InboundIntent,
      { readonly kind: "create_reminder" | "manage_planning" }
    >
  ): Promise<OutboundReply> {
    if (!this.dependencies.planningTaskManager) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result =
      intent.kind === "create_reminder" || intent.action === "create"
        ? await this.dependencies.planningTaskManager.execute({
            action: "create",
            title:
              intent.kind === "create_reminder"
                ? intent.summary
                : intent.title ?? "",
            actorId: context.actor.id,
            ...planningDateFromIntent(
              context,
              intent,
              this.dependencies.timeZone ?? "UTC"
            ),
            ...(intent.kind === "manage_planning" && intent.checklistItems
              ? { checklistItems: intent.checklistItems }
              : {})
          })
        : await this.dependencies.planningTaskManager.execute({
            action: "complete",
            query: intent.query ?? "",
            now: context.receivedAt
          });

    if (intent.kind === "create_reminder" || intent.action === "create") {
      const title = intent.kind === "create_reminder"
        ? intent.summary
        : intent.title ?? "";

      if (result.status === "created" && title) {
        await this.saveLastOperationContext(context, {
          operationKind: "planning_task_created",
          entityKind: "planning_task",
          entityId: result.item.id,
          entityLabel: result.item.title
        });
      }
    }

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async manageSubjectAliases(
    context: AcceptedMessageContext,
    intent: Extract<
      InboundIntent,
      {
        readonly kind:
          | "save_subject_alias"
          | "list_subject_aliases"
          | "delete_subject_alias"
          | "diagnose_subject_aliases";
      }
    >
  ): Promise<OutboundReply> {
    if (!this.dependencies.subjectAliasManager) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.subjectAliasManager.execute(
      toSubjectAliasAction(intent)
    );

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async archiveFamilyFact(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "archive_fact" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.familyFactArchiver) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.familyFactArchiver.execute({
      query: intent.query
    });

    if (result.status === "archived") {
      return {
        chatId: context.chat.id,
        text: `Archived family fact: ${result.fact.body}`
      };
    }

    if (result.status === "ambiguous") {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingFamilyFactArchiveDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        candidates: result.candidates,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: [
          "I found multiple active family facts that could match.",
          ...result.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
          "Reply with the number to archive, or cancel."
        ].join("\n")
      };
    }

    return {
      chatId: context.chat.id,
      text: "I could not find an active family fact matching that request."
    };
  }

  private async listPendingAccessRequests(chatId: string): Promise<OutboundReply> {
    if (!this.dependencies.pendingAccessRequests) {
      return {
        chatId,
        text: "Pending access review is not configured."
      };
    }

    const requests = await this.dependencies.pendingAccessRequests.list();

    if (requests.length === 0) {
      return {
        chatId,
        text: "No pending access requests."
      };
    }

    return {
      chatId,
      text: [
        "Pending access requests:",
        ...requests.flatMap((request) => [
          `- ${request.actor.id}: ${request.actor.displayName} (${request.identity.provider} user ${request.identity.providerUserId}, chat ${request.chat.providerChatId}, ${request.chat.kind})`,
          `Approve: /approve ${request.actor.id}`,
          `Reject: /reject ${request.actor.id}`
        ])
      ].join("\n")
    };
  }

  private async reviewPendingAccessRequest(
    input: DispatchAcceptedCommandInput
  ): Promise<OutboundReply> {
    if (!this.dependencies.pendingAccessRequests) {
      return {
        chatId: input.context.chat.id,
        text: "Pending access review is not configured."
      };
    }

    const actorId = parseActorId(input.route.normalizedText);

    if (!actorId) {
      return {
        chatId: input.context.chat.id,
        text: `Usage: /${input.route.kind === "approve_access_request" ? "approve" : "reject"} <actorId>.`
      };
    }

    const decision: PendingIdentityDecision =
      input.route.kind === "approve_access_request" ? "approve" : "reject";
    const result = await this.dependencies.pendingAccessRequests.review({
      actorId,
      decision
    });

    if (!result.reviewed) {
      return {
        chatId: input.context.chat.id,
        text: `No pending access request found for ${actorId}.`
      };
    }

    return {
      chatId: input.context.chat.id,
      text:
        decision === "approve"
          ? `Approved access request for ${actorId}.`
          : `Rejected access request for ${actorId}.`
    };
  }

  private async listUnreadNotifications(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    if (!this.dependencies.notifications) {
      return {
        chatId: context.chat.id,
        text: "Notifications are not configured."
      };
    }

    const result = await this.dependencies.notifications.listUnread({
      actorId: context.actor.id
    });

    if (result.notifications.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No unread notifications."
      };
    }

    return {
      chatId: context.chat.id,
      text: [
        "Unread notifications:",
        ...result.notifications.flatMap((notification, index) => [
          `${index + 1}. ${notification.title}`,
          ...notification.body.split("\n").map((line) => `   ${line}`),
          `   id: ${notification.id}`
        ])
      ].join("\n")
    };
  }

  private async markNotificationRead(
    input: DispatchAcceptedCommandInput
  ): Promise<OutboundReply> {
    if (!this.dependencies.notifications) {
      return {
        chatId: input.context.chat.id,
        text: "Notifications are not configured."
      };
    }

    const notificationId = parseNotificationId(input.route.normalizedText);

    if (!notificationId) {
      return {
        chatId: input.context.chat.id,
        text: "Usage: /read <notificationId>."
      };
    }

    await this.dependencies.notifications.markRead({
      notificationId,
      actorId: input.context.actor.id
    });

    return {
      chatId: input.context.chat.id,
      text: `Marked notification ${notificationId} as read.`
    };
  }

  private async activateAdminSession(
    input: DispatchAcceptedCommandInput
  ): Promise<OutboundReply> {
    if (!this.dependencies.adminSessionActivator) {
      return {
        chatId: input.context.chat.id,
        text: "Admin mode is not configured."
      };
    }

    const secret = parseAdminSecret(input.route.normalizedText);
    if (!secret) {
      return {
        chatId: input.context.chat.id,
        text: "Usage: /admin <secret>."
      };
    }

    const result = await this.dependencies.adminSessionActivator.execute({
      actor: input.context.actor,
      chat: input.context.chat,
      secret,
      now: this.dependencies.now?.() ?? input.context.receivedAt
    });

    if (!result.activated) {
      return {
        chatId: input.context.chat.id,
        text: `Admin mode not activated: ${result.reason}.`
      };
    }

    return {
      chatId: input.context.chat.id,
      text: `Admin mode activated until ${result.session.expiresAt.toISOString()}.`
    };
  }

  private async storeFamilyMessageAttachments(
    context: AcceptedMessageContext,
    intent?: Extract<InboundIntent, { readonly kind: "store_file" }>,
    destination: FileUploadDestination | undefined = parseFileUploadDestination(
      context.text
    )
  ): Promise<OutboundReply> {
    if (context.attachments.length === 0) {
      return {
        chatId: context.chat.id,
        text: "I can store a file after you attach one."
      };
    }

    if (!destination) {
      if (this.dependencies.documentAttachmentStore) {
        destination = "google_drive";
      } else if (!this.dependencies.pendingFileDestinationDecisions) {
        destination = "local_inbox";
      } else {
        const now = this.dependencies.now?.() ?? new Date();
        await this.dependencies.pendingFileDestinationDecisions?.save({
          chatId: context.chat.id,
          actorId: context.actor.id,
          provider: context.provider,
          receivedAt: context.receivedAt,
          attachments: context.attachments,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
        });

        return {
          chatId: context.chat.id,
          text: fileDestinationPrompt(context.attachments)
        };
      }
    }

    if (destination === "google_drive") {
      return this.storeFamilyMessageDocumentAttachments(
        context,
        parseModelDocumentMetadata(intent)
      );
    }

    if (!canUseLocalFileStorage(context)) {
      return {
        chatId: context.chat.id,
        text: "Локальное хранилище доступно только админу. Файл не сохранен."
      };
    }

    let results:
      | Awaited<
          ReturnType<NonNullable<typeof this.dependencies.attachmentStore>["execute"]>
        >
      | undefined;

    try {
      results = await this.dependencies.attachmentStore?.execute({
        provider: context.provider,
        receivedAt: context.receivedAt,
        attachments: context.attachments
      });
    } catch (error) {
      const message = attachmentIoErrorMessage(error);
      if (message) {
        return {
          chatId: context.chat.id,
          text: message
        };
      }

      throw error;
    }

    if (!results || results.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No downloadable attachments found."
      };
    }

    const duplicates = results.filter(
      (result): result is Extract<StoreInboundFileResult, { status: "duplicate" }> =>
        result.status === "duplicate"
    );

    if (duplicates.length > 0) {
      const first = duplicates[0];
      if (first) {
        const now = this.dependencies.now?.() ?? new Date();
        await this.dependencies.pendingFileDuplicateDecisions?.save({
          chatId: context.chat.id,
          actorId: context.actor.id,
          fileName: first.fileName,
          suggestedCopyName: suggestCopyName(first.fileName),
          existingRecordId: first.existingRecord.id,
          provider: context.provider,
          receivedAt: context.receivedAt,
          ...sourceAttachmentForDuplicate(context.attachments, first.fileName),
          createdAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
        });
      }

      return {
        chatId: context.chat.id,
        text: duplicateAttachmentReply(duplicates)
      };
    }

    const storedRecords = results.flatMap((result) =>
      result.status === "stored" ? [result.record] : []
    );
    const firstStoredRecord = storedRecords[0];

    if (firstStoredRecord) {
      await this.saveLastOperationContext(context, {
        operationKind: "file_stored",
        entityKind: "file_inbox_record",
        entityId: firstStoredRecord.id,
        entityLabel: firstStoredRecord.originalFileName
      });
    }

    return {
      chatId: context.chat.id,
      text: intent?.summary
        ? `Saved ${storedRecords.length} attachment(s): ${intent.summary}.`
        : `Saved ${storedRecords.length} attachment(s).`
    };
  }

  private async saveLastDocumentOperationContext(
    context: AcceptedMessageContext,
    documents: readonly NonNullable<LastOperationContext["document"]>[],
    operationKind: Extract<
      LastOperationContext["operationKind"],
      "document_uploaded" | "document_registered"
    >
  ): Promise<void> {
    const document = documents[0];

    if (!document) {
      return;
    }

    await this.saveLastOperationContext(context, {
      operationKind,
      entityKind: "document",
      entityId: document.id,
      entityLabel: document.name,
      document
    });
  }

  private async saveLastOperationContext(
    context: AcceptedMessageContext,
    input: Pick<
      LastOperationContext,
      "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
    >
  ): Promise<void> {
    if (!this.dependencies.lastOperations) {
      return;
    }

    const now = this.dependencies.now?.() ?? new Date();

    try {
      await this.dependencies.lastOperations.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        ...input,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });
    } catch {
      return;
    }
  }

  private operationDeniedReply(
    context: AcceptedMessageContext,
    action: AccessAction | undefined
  ): OutboundReply | undefined {
    if (!action) {
      return undefined;
    }

    const decision = evaluateAccess({
      actor: context.actor,
      chat: context.chat,
      action,
      ...(context.adminSession ? { adminSession: context.adminSession } : {}),
      now: this.dependencies.now?.() ?? context.receivedAt
    });

    if (decision.allowed) {
      return undefined;
    }

    return {
      chatId: context.chat.id,
      text: `Access denied: ${decision.reason}.`
    };
  }

  private pendingActorDeniedReply(
    context: AcceptedMessageContext,
    pending: { readonly actorId: string }
  ): OutboundReply | undefined {
    if (pending.actorId === context.actor.id) {
      return undefined;
    }

    return {
      chatId: context.chat.id,
      text: "This pending action belongs to another user."
    };
  }

  private async storeFamilyMessageDocumentAttachments(
    context: AcceptedMessageContext,
    metadataOverride: {
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    } = {}
  ): Promise<OutboundReply> {
    if (!this.dependencies.documentAttachmentStore) {
      return {
        chatId: context.chat.id,
        text: "Google Drive upload is not configured yet. File was not saved."
      };
    }

    const metadata = mergeDocumentMetadata(
      parseDocumentMetadata(context.text),
      metadataOverride
    );
    let results: Awaited<
      ReturnType<NonNullable<typeof this.dependencies.documentAttachmentStore>["execute"]>
    >;

    try {
      results = await this.dependencies.documentAttachmentStore.execute({
        provider: context.provider,
        receivedAt: context.receivedAt,
        attachments: context.attachments,
        userText: context.text,
        ...metadata
      });
    } catch (error) {
      const message = attachmentIoErrorMessage(error);
      if (message) {
        return {
          chatId: context.chat.id,
          text: message
        };
      }

      throw error;
    }
    const folderChoices = results.flatMap((result) =>
      result.status === "needs_folder_choice" ? [result] : []
    );

    const choice = folderChoices[0];

    if (choice) {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: {
          kind: "choose_upload_folder",
          provider: context.provider,
          receivedAt: context.receivedAt.toISOString(),
          attachment: {
            fileName: choice.attachment.fileName,
            ...(choice.attachment.mimeType
              ? { mimeType: choice.attachment.mimeType }
              : {}),
            bytesBase64: Buffer.from(choice.attachment.bytes).toString("base64")
          },
          parentPath: choice.parentPath,
          parentFolderId: choice.parentFolderId,
          options: choice.options,
          ...(choice.documentType ? { documentType: choice.documentType } : {}),
          ...(choice.subjectId ? { subjectId: choice.subjectId } : {})
        },
        candidates: [],
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: formatUploadFolderChoicePrompt(choice)
      };
    }

    const uploadedDocuments = results.flatMap((result) =>
      result.status === "uploaded" ? [result.document] : []
    );

    if (uploadedDocuments.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No downloadable attachments found."
      };
    }

    const receiptWarrantyProcessing =
      this.dependencies.receiptWarrantyUploadProcessor
        ? await this.dependencies.receiptWarrantyUploadProcessor.execute({
            documents: uploadedDocuments,
            ...(metadata.documentType
              ? { documentType: metadata.documentType }
              : {}),
            description: context.text,
            receivedAt: context.receivedAt,
            actorId: context.actor.id
          })
        : {
            documents: uploadedDocuments,
            replyLines: []
          };
    const describedDocuments = receiptWarrantyProcessing.documents;
    const warrantyReminderLines = receiptWarrantyProcessing.replyLines;

    if (
      !metadata.documentType &&
      !metadata.subjectId &&
      this.dependencies.documentSearchDescriptionRecorder
    ) {
      await this.saveLastDocumentOperationContext(
        context,
        describedDocuments,
        "document_uploaded"
      );
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "describe_for_search" },
        candidates: describedDocuments,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: [
          formatUploadedDocumentsReply(uploadedDocuments),
          "Как описать этот файл для поиска?",
          "Можно ответить коротко, например: личная карта Алекса, или skip."
        ].join("\n")
      };
    }

    if (!metadata.documentType && !metadata.subjectId) {
      await this.saveLastDocumentOperationContext(
        context,
        describedDocuments,
        "document_uploaded"
      );
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "update_metadata" },
        candidates: describedDocuments,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: [
          formatUploadedDocumentsReply(uploadedDocuments),
          "Какой это документ?",
          "Можно ответить тип и subject, например: identity max, или skip."
        ].join("\n")
      };
    }

    const placementSuggested = await this.savePendingDocumentPlacementSuggestion(
      context,
      describedDocuments
    );
    await this.saveLastDocumentOperationContext(
      context,
      describedDocuments,
      "document_uploaded"
    );

    return {
      chatId: context.chat.id,
      text: [
        formatUploadedDocumentsReply(describedDocuments),
        ...(placementSuggested && describedDocuments[0]
          ? formatPlacementSuggestionLines(describedDocuments[0])
          : []),
        ...warrantyReminderLines
      ].join("\n")
    };
  }

  private async dispatchPendingFileDestinationDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDestinationDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    const destination = parseFileUploadDestination(context.text);

    if (!destination) {
      const interrupted = await this.dispatchSafePendingFileDestinationInterruption(
        context,
        pending
      );

      if (interrupted) {
        return interrupted;
      }

      return {
        chatId: context.chat.id,
        text: fileDestinationPrompt(pending.attachments)
      };
    }

    const reply = await this.storeFamilyMessageAttachments(
      {
        ...context,
        provider: pending.provider,
        receivedAt: pending.receivedAt,
        attachments: pending.attachments
      },
      undefined,
      destination
    );

    await this.dependencies.pendingFileDestinationDecisions?.clearByChatId(
      context.chat.id
    );
    await this.recordPendingRoutingEvent({
      pendingKind: "file_destination",
      policy: fileDestinationDecisionPolicy,
      choiceResult: destination,
      pendingCleared: true
    });

    return reply;
  }

  private async dispatchSafePendingFileDestinationInterruption(
    context: AcceptedMessageContext,
    pending: PendingFileDestinationDecision
  ): Promise<OutboundReply | undefined> {
    return this.dispatchSafePendingInterruption({
      pendingKind: "file_destination",
      context,
      policy: fileDestinationDecisionPolicy,
      classifierText: buildPendingFileDestinationInterruptionClassifierText(
        pending,
        context.text
      ),
      clearPending: () =>
        this.dependencies.pendingFileDestinationDecisions?.clearByChatId(
          context.chat.id
        )
    });
  }

  private async dispatchClassifiedModelIntent(input: {
    readonly context: AcceptedMessageContext;
    readonly intent: InboundIntent;
    readonly pendingClarification?: PendingClarification | undefined;
    readonly lastOperation?: LastOperationContext | undefined;
    readonly attachments: readonly MessageAttachment[];
    readonly allowFileOrClarification: boolean;
  }): Promise<OutboundReply> {
    const { context, intent } = input;
    const deniedReply = this.operationDeniedReply(
      context,
      requiredAccessActionForIntent(intent)
    );
    if (deniedReply) {
      return deniedReply;
    }

    if (intent.kind === "ask_clarification") {
      if (!input.allowFileOrClarification) {
        return {
          chatId: context.chat.id,
          text: `I understood this as ${intent.kind}, but that action is not connected yet.`
        };
      }

      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingClarifications?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        originalText: input.pendingClarification?.originalText ?? context.text,
        originalAttachments:
          input.pendingClarification?.originalAttachments ?? context.attachments,
        question: intent.question,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: intent.question
      };
    }

    if (intent.kind === "unsupported" && input.allowFileOrClarification) {
      const now = this.dependencies.now?.() ?? new Date();
      const question = domainClarificationQuestion();
      await this.dependencies.pendingClarifications?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        originalText: input.pendingClarification?.originalText ?? context.text,
        originalAttachments:
          input.pendingClarification?.originalAttachments ?? context.attachments,
        question,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });

      return {
        chatId: context.chat.id,
        text: question
      };
    }

    if (intent.kind === "store_file") {
      if (!input.allowFileOrClarification) {
        return {
          chatId: context.chat.id,
          text: `I understood this as ${intent.kind}, but that action is not connected yet.`
        };
      }

      await this.dependencies.pendingClarifications?.clearByChatId(
        context.chat.id
      );

      return this.storeFamilyMessageAttachments(
        {
          ...context,
          attachments: input.attachments
        },
        intent,
        resolveFileUploadDestinationForModelIntent(context.text, intent)
      );
    }

    await this.dependencies.pendingClarifications?.clearByChatId(
      context.chat.id
    );

    if (intent.kind === "record_fact") {
      return this.recordFamilyFact(context, intent);
    }

    if (intent.kind === "record_journal_entry") {
      return this.recordFamilyJournalEntry(context, intent);
    }

    if (intent.kind === "answer_from_memory") {
      return this.recallFamilyFacts(context, intent);
    }

    if (intent.kind === "recall_journal_entries") {
      return this.recallFamilyJournalEntries(context, intent);
    }

    if (isShoppingIntent(intent)) {
      return this.dispatchShoppingIntent(context, intent);
    }

    if (intent.kind === "query_planning") {
      return this.queryPlanningState(context, intent);
    }

    if (intent.kind === "manage_planning") {
      return this.managePlanningTask(context, intent);
    }

    if (intent.kind === "create_reminder") {
      return this.managePlanningTask(context, intent);
    }

    if (intent.kind === "update_last_operation") {
      return this.updateLastOperation(context, intent, input.lastOperation);
    }

    if (intent.kind === "archive_fact") {
      return this.archiveFamilyFact(context, intent);
    }

    if (intent.kind === "register_document") {
      return this.registerDocument(context, intent);
    }

    if (intent.kind === "find_document") {
      return this.findDocuments(context, intent);
    }

    if (intent.kind === "update_document" || intent.kind === "archive_document") {
      return this.manageDocument(context, intent, input.lastOperation);
    }

    if (
      intent.kind === "save_subject_alias" ||
      intent.kind === "list_subject_aliases" ||
      intent.kind === "delete_subject_alias" ||
      intent.kind === "diagnose_subject_aliases"
    ) {
      return this.manageSubjectAliases(context, intent);
    }

    return Promise.resolve({
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    });
  }

  private async dispatchPendingDuplicateDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    const decision = await resolvePendingDecision<DuplicateDecision>({
      policy: "choice_only",
      prompt: duplicateDecisionPrompt(pending.fileName, pending.suggestedCopyName),
      userReply: context.text,
      options: duplicateDecisionOptions,
      parseDeterministicChoice: parseDuplicateDecision,
      classifier: this.dependencies.pendingChoiceClassifier as
        | PendingChoiceClassifier<DuplicateDecision>
        | undefined
    });

    if (decision === undefined) {
      await this.recordPendingRoutingEvent({
        pendingKind: "file_duplicate",
        policy: "choice_only",
        choiceResult: "unclear",
        pendingCleared: false
      });

      return {
        chatId: context.chat.id,
        text: [
          `Я жду решение по файлу ${pending.fileName}.`,
          `Можно написать: "сохрани копию", "перезапиши" или "ничего не делай".`
        ].join("\n")
      };
    }

    if (decision === "skip") {
      await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
        context.chat.id
      );
      await this.recordPendingRoutingEvent({
        pendingKind: "file_duplicate",
        policy: "choice_only",
        choiceResult: decision,
        pendingCleared: true
      });

      return {
        chatId: context.chat.id,
        text: `Ок, ничего не делаю с файлом ${pending.fileName}.`
      };
    }

    const result = await this.resolveDuplicateMutation(decision, pending);

    if (result.status === "copied") {
      await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
        context.chat.id
      );
      await this.recordPendingRoutingEvent({
        pendingKind: "file_duplicate",
        policy: "choice_only",
        choiceResult: decision,
        pendingCleared: true
      });

      return {
        chatId: context.chat.id,
        text: `Готово: сохранил копию как ${pending.suggestedCopyName}.`
      };
    }

    if (result.status === "overwritten") {
      await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
        context.chat.id
      );
      await this.recordPendingRoutingEvent({
        pendingKind: "file_duplicate",
        policy: "choice_only",
        choiceResult: decision,
        pendingCleared: true
      });

      return {
        chatId: context.chat.id,
        text: `Готово: перезаписал ${pending.fileName}.`
      };
    }

    return {
      chatId: context.chat.id,
      text: `Не могу применить решение по файлу ${pending.fileName}: не сохранились данные исходного вложения. Пришли файл еще раз.`
    };
  }

  private async dispatchPendingDuplicateDestination(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision,
    destination: FileUploadDestination
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    if (
      destination === "google_drive" &&
      this.dependencies.fileInboxDocumentUploader
    ) {
      const upload = await this.dependencies.fileInboxDocumentUploader.execute({
        fileInboxRecordId: pending.existingRecordId
      });

      if (upload.status === "not_found") {
        return {
          chatId: context.chat.id,
          text: `Не могу сохранить ${pending.fileName} в Google Drive: локальная запись не найдена. Пришли файл еще раз.`
        };
      }

      const placementSuggested =
        await this.savePendingDocumentPlacementSuggestion(context, [
          upload.document
        ]);

      await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: [
          formatUploadedDocumentsReply([upload.document]),
          ...(placementSuggested
            ? formatPlacementSuggestionLines(upload.document)
            : [])
        ].join("\n")
      };
    }

    if (!pending.provider || !pending.receivedAt || !pending.sourceAttachment) {
      return {
        chatId: context.chat.id,
        text: `Не могу сохранить ${pending.fileName} в выбранное место: не сохранились данные исходного вложения. Пришли файл еще раз.`
      };
    }

    const reply = await this.storeFamilyMessageAttachments(
      {
        ...context,
        provider: pending.provider,
        receivedAt: pending.receivedAt,
        attachments: [pending.sourceAttachment]
      },
      undefined,
      destination
    );

    await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
      context.chat.id
    );

    return reply;
  }

  private async dispatchPendingDocumentPlacementDecision(
    context: AcceptedMessageContext,
    pending: PendingDocumentPlacementDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    const decision = await resolvePendingDecision<PlacementDecision>({
      policy: documentPlacementDecisionPolicy,
      prompt: placementDecisionPrompt(pending),
      userReply: context.text,
      options: placementDecisionOptions,
      parseDeterministicChoice: parsePlacementDecision,
      classifier: this.dependencies.pendingChoiceClassifier as
        | PendingChoiceClassifier<PlacementDecision>
        | undefined
    });

    if (!decision) {
      const interrupted = await this.dispatchSafePendingDocumentPlacementInterruption(
        context,
        pending
      );

      if (interrupted) {
        return interrupted;
      }

      return {
        chatId: context.chat.id,
        text: placementDecisionPrompt(pending)
      };
    }

    if (decision === "skip") {
      await this.dependencies.pendingDocumentPlacementDecisions?.clearByChatId(
        context.chat.id
      );
      await this.recordPendingRoutingEvent({
        pendingKind: "document_placement",
        policy: documentPlacementDecisionPolicy,
        choiceResult: decision,
        pendingCleared: true
      });

      return {
        chatId: context.chat.id,
        text: `Ок, оставляю ${pending.document.name} на текущем месте.`
      };
    }

    if (!pending.targetFolderId || !this.dependencies.documentPlacementMover) {
      await this.dependencies.pendingDocumentPlacementDecisions?.clearByChatId(
        context.chat.id
      );
      await this.recordPendingRoutingEvent({
        pendingKind: "document_placement",
        policy: documentPlacementDecisionPolicy,
        choiceResult: decision,
        pendingCleared: true
      });

      return {
        chatId: context.chat.id,
        text: [
          `Не двигаю ${pending.document.name}: для папки ${pending.targetFolderPath} пока не настроен Drive folder id.`,
          "Файл остался на текущем месте."
        ].join("\n")
      };
    }

    await this.dependencies.documentPlacementMover.execute({
      externalId: pending.document.externalId,
      targetFolderId: pending.targetFolderId
    });
    await this.dependencies.pendingDocumentPlacementDecisions?.clearByChatId(
      context.chat.id
    );
    await this.recordPendingRoutingEvent({
      pendingKind: "document_placement",
      policy: documentPlacementDecisionPolicy,
      choiceResult: decision,
      pendingCleared: true
    });

    return {
      chatId: context.chat.id,
      text: `Готово: переместил ${pending.document.name} в ${pending.targetFolderPath}.`
    };
  }

  private async dispatchSafePendingDocumentPlacementInterruption(
    context: AcceptedMessageContext,
    pending: PendingDocumentPlacementDecision
  ): Promise<OutboundReply | undefined> {
    return this.dispatchSafePendingInterruption({
      pendingKind: "document_placement",
      context,
      policy: documentPlacementDecisionPolicy,
      classifierText: buildPendingDocumentPlacementInterruptionClassifierText(
        pending,
        context.text
      ),
      clearPending: () =>
        this.dependencies.pendingDocumentPlacementDecisions?.clearByChatId(
          context.chat.id
        )
    });
  }

  private async dispatchSafePendingInterruption(input: {
    readonly pendingKind: PendingRoutingEventAttributes["pendingKind"];
    readonly context: AcceptedMessageContext;
    readonly policy: PendingDecisionPolicy;
    readonly classifierText: string;
    readonly clearPending: () => Promise<void> | undefined;
  }): Promise<OutboundReply | undefined> {
    if (
      !allowsFreeFormPendingInterruption(input.policy) ||
      !this.dependencies.intentClassifier
    ) {
      return undefined;
    }

    let intent: InboundIntent;
    try {
      intent = await this.dependencies.intentClassifier.execute({
        text: input.classifierText,
        attachments: []
      });
    } catch {
      await this.recordPendingRoutingEvent({
        pendingKind: input.pendingKind,
        policy: input.policy,
        choiceResult: "unclear",
        interruptionIntent: "model_error",
        pendingCleared: false
      });

      return undefined;
    }

    if (intent.kind === "ask_clarification" || intent.kind === "store_file") {
      await this.recordPendingRoutingEvent({
        pendingKind: input.pendingKind,
        policy: input.policy,
        choiceResult: "unclear",
        interruptionIntent: intent.kind,
        pendingCleared: false
      });

      return undefined;
    }

    await input.clearPending();
    await this.recordPendingRoutingEvent({
      pendingKind: input.pendingKind,
      policy: input.policy,
      choiceResult: "unclear",
      interruptionIntent: intent.kind,
      pendingCleared: true
    });

    return this.dispatchClassifiedModelIntent({
      context: input.context,
      intent,
      attachments: [],
      allowFileOrClarification: false
    });
  }

  private async registerDocument(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "register_document" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.documentRegistrar) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.documentRegistrar.execute({
      externalIdOrUrl: intent.externalIdOrUrl,
      ...(intent.documentType ? { documentType: intent.documentType } : {}),
      ...(intent.subjectId ? { subjectId: intent.subjectId } : {})
    });
    await this.saveLastOperationContext(context, {
      operationKind: "document_registered",
      entityKind: "document",
      entityId: result.document.id,
      entityLabel: result.document.name,
      document: result.document
    });

    return {
      chatId: context.chat.id,
      text: formatRegisteredDocumentReply(result.document)
    };
  }

  private async findDocuments(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "find_document" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.documentLookup) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.documentLookup.execute({
      ...(intent.query ? { query: intent.query } : {}),
      ...(intent.documentType ? { documentType: intent.documentType } : {}),
      ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
      ...(intent.requests ? { requests: intent.requests } : {})
    });

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async manageDocument(
    context: AcceptedMessageContext,
    intent: Extract<
      InboundIntent,
      { readonly kind: "update_document" | "archive_document" }
    >,
    lastOperation?: LastOperationContext
  ): Promise<OutboundReply> {
    if (!this.dependencies.documentManager) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const lastDocument =
      intent.kind === "update_document" && !intent.query
        ? documentFromLastOperation(lastOperation)
        : undefined;
    const query = intent.query ?? lastDocument?.name;

    if (!query) {
      return {
        chatId: context.chat.id,
        text: "Which document should I update?"
      };
    }

    const result = await this.dependencies.documentManager.execute(
      intent.kind === "archive_document"
        ? {
            action: "archive",
            query
          }
        : {
            action: "update_metadata",
            query,
            ...(lastDocument ? { document: lastDocument } : {}),
            ...(intent.documentType ? { documentType: intent.documentType } : {}),
            ...(intent.subjectId ? { subjectId: intent.subjectId } : {})
          }
    );

    if (result.pending) {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action:
          result.pending.action.action === "archive"
            ? { kind: "archive" }
            : {
                kind: "update_metadata",
                ...(result.pending.action.documentType
                  ? { documentType: result.pending.action.documentType }
                  : {}),
                ...(result.pending.action.subjectId
                  ? { subjectId: result.pending.action.subjectId }
                  : {})
              },
        candidates: result.pending.candidates,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });
    }

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async updateLastOperation(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "update_last_operation" }>,
    lastOperation?: LastOperationContext
  ): Promise<OutboundReply> {
    if (intent.operationAction === "append_checklist") {
      return this.addChecklistItemsToLastPlanningTask(
        context,
        intent,
        lastOperation
      );
    }

    if (!lastOperation) {
      return {
        chatId: context.chat.id,
        text: "What should I update?"
      };
    }

    if (lastOperation.entityKind === "family_fact") {
      if (!intent.summary) {
        return {
          chatId: context.chat.id,
          text: "What should I update?"
        };
      }

      if (!this.dependencies.familyFactUpdater) {
        return {
          chatId: context.chat.id,
          text: "Family fact updates are not connected yet."
        };
      }

      const result = await this.dependencies.familyFactUpdater.execute({
        factId: lastOperation.entityId,
        body: intent.summary
      });

      if (result.status !== "updated") {
        return {
          chatId: context.chat.id,
          text: "I could not find the latest family fact to update."
        };
      }

      await this.saveLastOperationContext(context, {
        operationKind: "family_fact_recorded",
        entityKind: "family_fact",
        entityId: result.fact.id,
        entityLabel: result.fact.body
      });

      return {
        chatId: context.chat.id,
        text: `Updated family fact: ${result.fact.body}`
      };
    }

    if (lastOperation.entityKind === "family_journal_entry") {
      if (!intent.summary) {
        return {
          chatId: context.chat.id,
          text: "What should I update?"
        };
      }

      if (!this.dependencies.familyJournalUpdater) {
        return {
          chatId: context.chat.id,
          text: "Family journal updates are not connected yet."
        };
      }

      const result = await this.dependencies.familyJournalUpdater.execute({
        entryId: lastOperation.entityId,
        body: intent.summary
      });

      if (result.status !== "updated") {
        return {
          chatId: context.chat.id,
          text: "I could not find the latest family journal entry to update."
        };
      }

      await this.saveLastOperationContext(context, {
        operationKind: "family_journal_entry_recorded",
        entityKind: "family_journal_entry",
        entityId: result.entry.id,
        entityLabel: result.entry.body
      });

      return {
        chatId: context.chat.id,
        text: `Updated family journal entry: ${result.entry.body}`
      };
    }

    if (lastOperation.entityKind === "planning_task") {
      if (!intent.summary) {
        return {
          chatId: context.chat.id,
          text: "What should I update?"
        };
      }

      if (!this.dependencies.planningTaskManager) {
        return {
          chatId: context.chat.id,
          text: "Planning writes are not connected yet."
        };
      }

      const result = await this.dependencies.planningTaskManager.execute({
        action: "update",
        taskId: lastOperation.entityId,
        title: intent.summary
      });

      if (result.status === "updated") {
        await this.saveLastOperationContext(context, {
          operationKind: "planning_task_created",
          entityKind: "planning_task",
          entityId: result.item.id,
          entityLabel: result.item.title
        });
      }

      return {
        chatId: context.chat.id,
        text: result.text
      };
    }

    return {
      chatId: context.chat.id,
      text: "I cannot update that latest operation yet."
    };
  }

  private async addChecklistItemsToLastPlanningTask(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "update_last_operation" }>,
    lastOperation?: LastOperationContext
  ): Promise<OutboundReply> {
    if (!lastOperation || lastOperation.entityKind !== "planning_task") {
      return {
        chatId: context.chat.id,
        text: "I can add checklist items only to the latest planning task."
      };
    }

    if (!intent.checklistItems?.length) {
      return {
        chatId: context.chat.id,
        text: "Which checklist items should I add?"
      };
    }

    if (!this.dependencies.planningTaskManager) {
      return {
        chatId: context.chat.id,
        text: "Planning writes are not connected yet."
      };
    }

    const result = await this.dependencies.planningTaskManager.execute({
      action: "add_checklist_items",
      taskId: lastOperation.entityId,
      ...(lastOperation.entityLabel ? { taskTitle: lastOperation.entityLabel } : {}),
      checklistItems: intent.checklistItems
    });

    if (result.status === "checklist_items_added") {
      await this.saveLastOperationContext(context, {
        operationKind: "planning_task_created",
        entityKind: "planning_task",
        entityId: result.item.id,
        entityLabel: result.item.title
      });
    }

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async dispatchPendingDocumentDecision(
    context: AcceptedMessageContext,
    pending: PendingDocumentDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    if (pending.action.kind === "choose_upload_folder") {
      return this.dispatchPendingUploadFolderChoice(context, pending);
    }

    if (pending.action.kind === "describe_for_search") {
      return this.dispatchPendingDocumentSearchDescription(context, pending);
    }

    if (isUploadedDocumentMetadataDecision(pending)) {
      return this.dispatchPendingUploadedDocumentMetadata(context, pending);
    }

    const decision = parseFamilyFactArchiveDecision(context.text);

    if (decision === undefined) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду выбор документа.",
          "Можно написать номер документа или \"отмена\"."
        ].join("\n")
      };
    }

    if (decision === "cancel") {
      await this.dependencies.pendingDocumentDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, не меняю документ."
      };
    }

    if (!this.dependencies.documentManager) {
      return {
        chatId: context.chat.id,
        text: "Document manager is not configured."
      };
    }

    const document = pending.candidates[decision];

    if (!document) {
      return {
        chatId: context.chat.id,
        text: "I could not find that document candidate anymore."
      };
    }

    const result = await this.dependencies.documentManager.execute(
      pending.action.kind === "archive"
        ? {
            action: "archive",
            query: document.name,
            document
          }
        : {
            action: "update_metadata",
            query: document.name,
            document,
            ...(pending.action.documentType
              ? { documentType: pending.action.documentType }
              : {}),
            ...(pending.action.subjectId
              ? { subjectId: pending.action.subjectId }
              : {})
          }
    );
    await this.dependencies.pendingDocumentDecisions?.clearByChatId(
      context.chat.id
    );

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async dispatchPendingUploadFolderChoice(
    context: AcceptedMessageContext,
    pending: PendingDocumentDecision
  ): Promise<OutboundReply> {
    if (pending.action.kind !== "choose_upload_folder") {
      return {
        chatId: context.chat.id,
        text: "Document folder choice is not pending."
      };
    }

    const decision = parseUploadFolderChoice(context.text, pending.action.options);

    if (decision === "cancel") {
      await this.dependencies.pendingDocumentDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, не сохраняю файл."
      };
    }

    if (!decision) {
      return {
        chatId: context.chat.id,
        text: formatUploadFolderChoicePrompt({
          status: "needs_folder_choice",
          attachment: {
            fileName: pending.action.attachment.fileName,
            ...(pending.action.attachment.mimeType
              ? { mimeType: pending.action.attachment.mimeType }
              : {}),
            bytes: new Uint8Array()
          },
          parentPath: pending.action.parentPath,
          parentFolderId: pending.action.parentFolderId,
          options: pending.action.options,
          ...(pending.action.documentType
            ? { documentType: pending.action.documentType }
            : {}),
          ...(pending.action.subjectId ? { subjectId: pending.action.subjectId } : {})
        })
      };
    }

    if (!this.dependencies.documentAttachmentStore) {
      return {
        chatId: context.chat.id,
        text: "Google Drive upload is not configured yet. File was not saved."
      };
    }

    const uploaded = await this.dependencies.documentAttachmentStore.uploadPrepared({
      attachment: {
        fileName: pending.action.attachment.fileName,
        ...(pending.action.attachment.mimeType
          ? { mimeType: pending.action.attachment.mimeType }
          : {}),
        bytes: Buffer.from(pending.action.attachment.bytesBase64, "base64")
      },
      targetFolderId: decision.folderId,
      ...selectedUploadFolderMetadata(pending.action, decision)
    });
    await this.dependencies.pendingDocumentDecisions?.clearByChatId(
      context.chat.id
    );

    return {
      chatId: context.chat.id,
      text: formatUploadedDocumentsReply([uploaded.document])
    };
  }

  private async dispatchPendingDocumentSearchDescription(
    context: AcceptedMessageContext,
    pending: PendingDocumentDecision
  ): Promise<OutboundReply> {
    if (parseSkipDocumentMetadata(context.text)) {
      await this.dependencies.pendingDocumentDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, оставляю документ без описания для поиска."
      };
    }

    if (!this.dependencies.documentSearchDescriptionRecorder) {
      return {
        chatId: context.chat.id,
        text: "Semantic document search storage is not configured."
      };
    }

    const updated: string[] = [];

    for (const document of pending.candidates) {
      const result =
        await this.dependencies.documentSearchDescriptionRecorder.execute({
          document,
          description: context.text
        });

      updated.push(formatDocumentSearchDescriptionResult(result.document, result));
    }
    await this.dependencies.pendingDocumentDecisions?.clearByChatId(
      context.chat.id
    );

    return {
      chatId: context.chat.id,
      text: updated.join("\n")
    };
  }

  private async dispatchPendingUploadedDocumentMetadata(
    context: AcceptedMessageContext,
    pending: PendingDocumentDecision
  ): Promise<OutboundReply> {
    if (parseSkipDocumentMetadata(context.text)) {
      await this.dependencies.pendingDocumentDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, оставляю документ без metadata."
      };
    }

    const metadata = parseDocumentMetadata(context.text);

    if (!metadata.documentType && !metadata.subjectId) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду metadata для загруженного документа.",
          "Можно написать тип и subject, например: identity max, или skip."
        ].join("\n")
      };
    }

    if (!this.dependencies.documentManager) {
      return {
        chatId: context.chat.id,
        text: "Document manager is not configured."
      };
    }

    const updated: string[] = [];
    const updatedDocuments = pending.candidates.map((document) => ({
      ...document,
      ...metadata
    }));

    for (const document of updatedDocuments) {
      const result = await this.dependencies.documentManager.execute({
        action: "update_metadata",
        query: document.name,
        document,
        ...metadata
      });
      updated.push(result.text);
    }
    await this.dependencies.pendingDocumentDecisions?.clearByChatId(
      context.chat.id
    );

    const placementSuggested = await this.savePendingDocumentPlacementSuggestion(
      context,
      updatedDocuments
    );

    return {
      chatId: context.chat.id,
      text: [
        updated.join("\n"),
        ...(placementSuggested
          ? formatPlacementSuggestionLines(updatedDocuments[0])
          : [])
      ].join("\n")
    };
  }

  private async savePendingDocumentPlacementSuggestion(
    context: AcceptedMessageContext,
    documents: readonly PendingDocumentPlacementDecision["document"][]
  ): Promise<boolean> {
    const [document] = documents;

    if (!document || !this.dependencies.pendingDocumentPlacementDecisions) {
      return false;
    }

    const targetFolderPath = canonicalDocumentFolderPath(document);
    const targetFolderId =
      this.dependencies.documentFolderResolver?.findFolderIdByPath(
        targetFolderPath
      );
    const now = this.dependencies.now?.() ?? new Date();
    await this.dependencies.pendingDocumentPlacementDecisions.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      document,
      targetFolderPath,
      ...(targetFolderId ? { targetFolderId } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
    });
    return true;
  }

  private async dispatchPendingFamilyFactDecision(
    context: AcceptedMessageContext,
    pending: PendingFamilyFactDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    const deterministicDecision = parseFamilyFactDecision(context.text);
    const modelDecision = deterministicDecision
      ? undefined
      : await resolvePendingDecision<FamilyFactDecision>({
          policy: "choice_only",
          prompt: familyFactDecisionPrompt(pending),
          userReply: context.text,
          options: familyFactDecisionOptions,
          parseDeterministicChoice: (text) =>
            parseFamilyFactDecision(text)?.decision,
          classifier: this.dependencies.pendingChoiceClassifier as
            | PendingChoiceClassifier<FamilyFactDecision>
            | undefined
        });
    const parsedDecision =
      deterministicDecision ?? (modelDecision ? { decision: modelDecision } : undefined);

    if (!parsedDecision) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду решение по семейному факту.",
          "Можно написать: \"обнови существующий\", \"создай новый\" или \"отмена\"."
        ].join("\n")
      };
    }

    if (!this.dependencies.factDecisionResolver) {
      return {
        chatId: context.chat.id,
        text: "Memory decision resolver is not configured."
      };
    }

    const result = await this.dependencies.factDecisionResolver.execute({
      decision: parsedDecision.decision,
      ...(parsedDecision.candidateIndex !== undefined
        ? { candidateIndex: parsedDecision.candidateIndex }
        : {}),
      pending
    });

    await this.dependencies.pendingFamilyFactDecisions?.clearByChatId(
      context.chat.id
    );

    if (result.status === "cancelled") {
      return {
        chatId: context.chat.id,
        text: "Ок, не меняю семейную память."
      };
    }

    if (result.status === "updated") {
      return {
        chatId: context.chat.id,
        text: `Готово: обновил семейный факт: ${result.fact.body}`
      };
    }

    return {
      chatId: context.chat.id,
      text: `Готово: сохранил новый семейный факт: ${result.fact.body}`
    };
  }

  private async dispatchPendingFamilyFactArchiveDecision(
    context: AcceptedMessageContext,
    pending: PendingFamilyFactArchiveDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    const decision = parseFamilyFactArchiveDecision(context.text);

    if (decision === undefined) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду выбор семейного факта для архивации.",
          "Можно написать номер факта или \"отмена\"."
        ].join("\n")
      };
    }

    if (decision === "cancel") {
      await this.dependencies.pendingFamilyFactArchiveDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, не архивирую семейный факт."
      };
    }

    if (!this.dependencies.familyFactArchiver) {
      return {
        chatId: context.chat.id,
        text: "Memory archive resolver is not configured."
      };
    }

    const candidate = pending.candidates[decision];

    if (!candidate) {
      return {
        chatId: context.chat.id,
        text: "I could not find that archive candidate anymore."
      };
    }

    const result = await this.dependencies.familyFactArchiver.execute({
      query: candidate.body,
      factId: candidate.id
    });
    await this.dependencies.pendingFamilyFactArchiveDecisions?.clearByChatId(
      context.chat.id
    );

    if (result.status === "archived") {
      return {
        chatId: context.chat.id,
        text: `Archived family fact: ${result.fact.body}`
      };
    }

    return {
      chatId: context.chat.id,
      text: "I could not find an active family fact matching that request."
    };
  }

  private async dispatchPendingShoppingItemDecision(
    context: AcceptedMessageContext,
    pending: PendingShoppingItemDecision
  ): Promise<OutboundReply> {
    const deniedReply = this.pendingActorDeniedReply(context, pending);
    if (deniedReply) {
      return deniedReply;
    }

    return this.shoppingRequests().dispatchPendingDecision(context, pending);
  }

  private async resolveDuplicateMutation(
    decision: FileDuplicateMutationDecision,
    pending: PendingFileDuplicateDecision
  ): Promise<ResolveFileDuplicateDecisionResult> {
    if (!this.dependencies.duplicateDecisionResolver) {
      return {
        status: "unavailable",
        reason: "missing_source_attachment"
      };
    }

    return await this.dependencies.duplicateDecisionResolver.execute({
      decision,
      pending
    });
  }

  private async recordPendingRoutingEvent(
    attributes: PendingRoutingEventAttributes
  ): Promise<void> {
    if (!this.dependencies.eventLog) {
      return;
    }

    const event: OperationalEvent = {
      type: "messaging.pending_routing",
      occurredAt: this.dependencies.now?.() ?? new Date(),
      attributes: {
        pending_kind: attributes.pendingKind,
        policy: attributes.policy,
        choice_result: attributes.choiceResult,
        pending_cleared: attributes.pendingCleared,
        ...(attributes.interruptionIntent
          ? { interruption_intent: attributes.interruptionIntent }
          : {})
      }
    };

    try {
      await this.dependencies.eventLog.record(event);
    } catch {
      // Pending routing observability must not change user-visible behavior.
    }
  }

}
