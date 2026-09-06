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
  allowsFreeFormPendingInterruption
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
  buildClarificationClassifierText,
  commandRailsHelpText,
  documentPlacementDecisionPolicy,
  domainClarificationQuestion,
  fileDestinationDecisionPolicy,
  mergeAttachments,
  parseActorId,
  parseAdminSecret,
  parseFileUploadDestination,
  parseNotificationId,
  pendingActorDeniedReply,
  requiredAccessActionForIntent,
  resolveFileUploadDestinationForModelIntent,
  scopedClassifierText,
  toClassifierLastOperation,
  toSubjectAliasAction
} from "./dispatch-command-helpers.js";
import { handlePendingFamilyFactArchiveDecision } from "./pending-handlers/family-fact-archive-handler.js";
import { handlePendingFamilyFactDecision } from "./pending-handlers/family-fact-decision-handler.js";
import { handlePendingFileDuplicateDecision } from "./pending-handlers/file-duplicate-decision-handler.js";
import { savePlacementSuggestion } from "./services/save-placement-suggestion.js";
import { AttachmentStorageService } from "./services/attachment-storage.js";
import { handlePendingFileDestinationDecision } from "./pending-handlers/file-destination-handler.js";
import { handlePendingDocumentPlacementDecision } from "./pending-handlers/document-placement-handler.js";
import { handlePendingFileDuplicateDestination } from "./pending-handlers/file-duplicate-destination-handler.js";
import { handlePendingDocumentDecision } from "./pending-handlers/document-decision-handler.js";
import {
  handleArchiveFamilyFact,
  handleRecallFamilyFacts,
  handleRecordFamilyFact
} from "./intent-handlers/family-fact-intents.js";
import {
  handleFindDocuments,
  handleManageDocument,
  handleRegisterDocument
} from "./intent-handlers/document-intents.js";
import {
  handleManagePlanningTask,
  handleQueryPlanningState
} from "./intent-handlers/planning-intents.js";
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
      ? pendingActorDeniedReply(context, pending)
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
    // Every pending-decision reply is text: an incoming attachment is a new
    // upload, not an answer to the pending question, so no handler applies.
    if (context.attachments.length > 0) {
      return undefined;
    }

    const chatId = context.chat.id;

    // Registry of feature-owned pending handlers, tried in priority order. Each
    // entry finds its own active pending record and, when present, hands off to
    // the feature handler; the shared loop owns only selection and ordering.
    const handlers: readonly (() => Promise<OutboundReply | undefined>)[] = [
      async () => {
        const pending =
          await this.dependencies.pendingFileDestinationDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingFileDestinationDecision(context, pending)
          : undefined;
      },
      async () => {
        const pending =
          await this.dependencies.pendingDocumentPlacementDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingDocumentPlacementDecision(context, pending)
          : undefined;
      },
      async () => {
        const pending =
          await this.dependencies.pendingFileDuplicateDecisions?.findActiveByChatId(
            chatId,
            now
          );

        if (!pending) {
          return undefined;
        }

        const destination = parseFileUploadDestination(context.text);

        return destination
          ? this.dispatchPendingDuplicateDestination(context, pending, destination)
          : this.dispatchPendingDuplicateDecision(context, pending);
      },
      async () => {
        const pending =
          await this.dependencies.pendingFamilyFactDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingFamilyFactDecision(context, pending)
          : undefined;
      },
      async () => {
        const pending =
          await this.dependencies.pendingFamilyFactArchiveDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingFamilyFactArchiveDecision(context, pending)
          : undefined;
      },
      async () => {
        const pending =
          await this.dependencies.pendingShoppingItemDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingShoppingItemDecision(context, pending)
          : undefined;
      },
      async () => {
        const pending =
          await this.dependencies.pendingDocumentDecisions?.findActiveByChatId(
            chatId,
            now
          );

        return pending
          ? this.dispatchPendingDocumentDecision(context, pending)
          : undefined;
      }
    ];

    for (const handler of handlers) {
      const reply = await handler();

      if (reply) {
        return reply;
      }
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

  private recordFamilyFact(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "record_fact" }>
  ): Promise<OutboundReply> {
    return handleRecordFamilyFact(context, intent, {
      recorder: this.dependencies.familyFactRecorder,
      pendingStore: this.dependencies.pendingFamilyFactDecisions,
      saveLastOperation: (operationContext, input) =>
        this.saveLastOperationContext(operationContext, input),
      now: () => this.dependencies.now?.() ?? new Date()
    });
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

  private recallFamilyFacts(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "answer_from_memory" }>
  ): Promise<OutboundReply> {
    return handleRecallFamilyFacts(context, intent, {
      recall: this.dependencies.familyFactRecall
    });
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

  private queryPlanningState(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "query_planning" }>
  ): Promise<OutboundReply> {
    return handleQueryPlanningState(context, intent, {
      planningQuery: this.dependencies.planningQuery
    });
  }

  private managePlanningTask(
    context: AcceptedMessageContext,
    intent: Extract<
      InboundIntent,
      { readonly kind: "create_reminder" | "manage_planning" }
    >
  ): Promise<OutboundReply> {
    return handleManagePlanningTask(context, intent, {
      planningTaskManager: this.dependencies.planningTaskManager,
      saveLastOperation: (operationContext, input) =>
        this.saveLastOperationContext(operationContext, input),
      timeZone: this.dependencies.timeZone ?? "UTC"
    });
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

  private archiveFamilyFact(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "archive_fact" }>
  ): Promise<OutboundReply> {
    return handleArchiveFamilyFact(context, intent, {
      archiver: this.dependencies.familyFactArchiver,
      pendingStore: this.dependencies.pendingFamilyFactArchiveDecisions,
      now: () => this.dependencies.now?.() ?? new Date()
    });
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

  private storeFamilyMessageAttachments(
    context: AcceptedMessageContext,
    intent?: Extract<InboundIntent, { readonly kind: "store_file" }>,
    destination?: FileUploadDestination
  ): Promise<OutboundReply> {
    return this.attachmentStorage().storeMessageAttachments(
      context,
      intent,
      destination
    );
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

  private storeFamilyMessageDocumentAttachments(
    context: AcceptedMessageContext,
    metadataOverride: {
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    } = {}
  ): Promise<OutboundReply> {
    return this.attachmentStorage().storeMessageDocumentAttachments(
      context,
      metadataOverride
    );
  }

  private attachmentStorage(): AttachmentStorageService {
    return new AttachmentStorageService({
      attachmentStore: this.dependencies.attachmentStore,
      documentAttachmentStore: this.dependencies.documentAttachmentStore,
      pendingFileDestinationDecisions:
        this.dependencies.pendingFileDestinationDecisions,
      pendingFileDuplicateDecisions:
        this.dependencies.pendingFileDuplicateDecisions,
      pendingDocumentDecisions: this.dependencies.pendingDocumentDecisions,
      receiptWarrantyUploadProcessor:
        this.dependencies.receiptWarrantyUploadProcessor,
      documentSearchDescriptionRecorder:
        this.dependencies.documentSearchDescriptionRecorder,
      now: () => this.dependencies.now?.() ?? new Date(),
      saveLastOperation: (context, input) =>
        this.saveLastOperationContext(context, input),
      saveLastDocumentOperation: (context, documents, operationKind) =>
        this.saveLastDocumentOperationContext(context, documents, operationKind),
      savePlacementSuggestion: (context, documents) =>
        this.savePendingDocumentPlacementSuggestion(context, documents)
    });
  }

  private dispatchPendingFileDestinationDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDestinationDecision
  ): Promise<OutboundReply> {
    return handlePendingFileDestinationDecision(context, pending, {
      storeAttachments: (attachmentContext, destination) =>
        this.attachmentStorage().storeMessageAttachments(
          attachmentContext,
          undefined,
          destination
        ),
      runInterruption: (interruptionContext, classifierText, clearPending) =>
        this.dispatchSafePendingInterruption({
          pendingKind: "file_destination",
          context: interruptionContext,
          policy: fileDestinationDecisionPolicy,
          classifierText,
          clearPending
        }),
      clearPending: (chatId) =>
        this.dependencies.pendingFileDestinationDecisions?.clearByChatId(chatId),
      recordRoutingEvent: (attributes) =>
        this.recordPendingRoutingEvent(attributes)
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

  private dispatchPendingDuplicateDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision
  ): Promise<OutboundReply> {
    return handlePendingFileDuplicateDecision(context, pending, {
      classifier: this.dependencies.pendingChoiceClassifier as
        | PendingChoiceClassifier<DuplicateDecision>
        | undefined,
      resolveDuplicate: (decision, target) =>
        this.resolveDuplicateMutation(decision, target),
      recordRoutingEvent: (attributes) =>
        this.recordPendingRoutingEvent(attributes),
      clearPending: (chatId) =>
        this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(chatId)
    });
  }

  private dispatchPendingDuplicateDestination(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision,
    destination: FileUploadDestination
  ): Promise<OutboundReply> {
    return handlePendingFileDuplicateDestination(
      context,
      pending,
      destination,
      {
        uploadFromInbox: this.dependencies.fileInboxDocumentUploader,
        storeAttachments: (attachmentContext, target) =>
          this.attachmentStorage().storeMessageAttachments(
            attachmentContext,
            undefined,
            target
          ),
        savePlacementSuggestion: (placementContext, documents) =>
          this.savePendingDocumentPlacementSuggestion(
            placementContext,
            documents
          ),
        clearPending: (chatId) =>
          this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(chatId)
      }
    );
  }

  private dispatchPendingDocumentPlacementDecision(
    context: AcceptedMessageContext,
    pending: PendingDocumentPlacementDecision
  ): Promise<OutboundReply> {
    return handlePendingDocumentPlacementDecision(context, pending, {
      classifier: this.dependencies.pendingChoiceClassifier as
        | PendingChoiceClassifier<PlacementDecision>
        | undefined,
      mover: this.dependencies.documentPlacementMover,
      runInterruption: (interruptionContext, classifierText, clearPending) =>
        this.dispatchSafePendingInterruption({
          pendingKind: "document_placement",
          context: interruptionContext,
          policy: documentPlacementDecisionPolicy,
          classifierText,
          clearPending
        }),
      clearPending: (chatId) =>
        this.dependencies.pendingDocumentPlacementDecisions?.clearByChatId(
          chatId
        ),
      recordRoutingEvent: (attributes) =>
        this.recordPendingRoutingEvent(attributes)
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

  private registerDocument(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "register_document" }>
  ): Promise<OutboundReply> {
    return handleRegisterDocument(context, intent, {
      registrar: this.dependencies.documentRegistrar,
      saveLastOperation: (operationContext, input) =>
        this.saveLastOperationContext(operationContext, input)
    });
  }

  private findDocuments(
    context: AcceptedMessageContext,
    intent: Extract<InboundIntent, { readonly kind: "find_document" }>
  ): Promise<OutboundReply> {
    return handleFindDocuments(context, intent, {
      lookup: this.dependencies.documentLookup
    });
  }

  private manageDocument(
    context: AcceptedMessageContext,
    intent: Extract<
      InboundIntent,
      { readonly kind: "update_document" | "archive_document" }
    >,
    lastOperation?: LastOperationContext
  ): Promise<OutboundReply> {
    return handleManageDocument(context, intent, lastOperation, {
      manager: this.dependencies.documentManager,
      pendingStore: this.dependencies.pendingDocumentDecisions,
      now: () => this.dependencies.now?.() ?? new Date()
    });
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

  private dispatchPendingDocumentDecision(
    context: AcceptedMessageContext,
    pending: PendingDocumentDecision
  ): Promise<OutboundReply> {
    return handlePendingDocumentDecision(context, pending, {
      documentManager: this.dependencies.documentManager,
      documentAttachmentStore: this.dependencies.documentAttachmentStore,
      documentSearchDescriptionRecorder:
        this.dependencies.documentSearchDescriptionRecorder,
      savePlacementSuggestion: (placementContext, documents) =>
        this.savePendingDocumentPlacementSuggestion(placementContext, documents),
      clearPending: (chatId) =>
        this.dependencies.pendingDocumentDecisions?.clearByChatId(chatId)
    });
  }

  private savePendingDocumentPlacementSuggestion(
    context: AcceptedMessageContext,
    documents: readonly PendingDocumentPlacementDecision["document"][]
  ): Promise<boolean> {
    return savePlacementSuggestion(context, documents, {
      store: this.dependencies.pendingDocumentPlacementDecisions,
      folderResolver: this.dependencies.documentFolderResolver,
      now: () => this.dependencies.now?.() ?? new Date()
    });
  }

  private dispatchPendingFamilyFactDecision(
    context: AcceptedMessageContext,
    pending: PendingFamilyFactDecision
  ): Promise<OutboundReply> {
    return handlePendingFamilyFactDecision(context, pending, {
      resolver: this.dependencies.factDecisionResolver,
      classifier: this.dependencies.pendingChoiceClassifier as
        | PendingChoiceClassifier<FamilyFactDecision>
        | undefined,
      clearPending: (chatId) =>
        this.dependencies.pendingFamilyFactDecisions?.clearByChatId(chatId)
    });
  }

  private dispatchPendingFamilyFactArchiveDecision(
    context: AcceptedMessageContext,
    pending: PendingFamilyFactArchiveDecision
  ): Promise<OutboundReply> {
    return handlePendingFamilyFactArchiveDecision(context, pending, {
      archiver: this.dependencies.familyFactArchiver,
      clearPending: (chatId) =>
        this.dependencies.pendingFamilyFactArchiveDecisions?.clearByChatId(
          chatId
        )
    });
  }

  private async dispatchPendingShoppingItemDecision(
    context: AcceptedMessageContext,
    pending: PendingShoppingItemDecision
  ): Promise<OutboundReply> {
    const deniedReply = pendingActorDeniedReply(context, pending);
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
