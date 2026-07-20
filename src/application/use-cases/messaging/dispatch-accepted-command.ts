import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { AccessAction } from "../../../core/domain/identity/access-policy.js";
import { evaluateAccess } from "../../../core/domain/identity/access-policy.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
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
  PreparedDocumentAttachment,
  StoreMessageDocumentAttachmentResult,
  StoreMessageDocumentAttachmentsInput
} from "../documents/store-message-document-attachments.js";
import type { UploadPreparedDocumentInput } from "../documents/store-message-document-attachments.js";
import type {
  RecordDocumentSearchDescriptionInput,
  RecordDocumentSearchDescriptionResult
} from "../documents/record-document-search-description.js";
import type {
  UploadFileInboxDocumentInput,
  UploadFileInboxDocumentResult
} from "../documents/upload-file-inbox-document.js";
import type { PendingAccessRequest } from "../../../ports/identity-access-repository-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { PendingClarification } from "../../../ports/state-repository-port.js";
import type { PendingDocumentDecision } from "../../../ports/state-repository-port.js";
import type { PendingDocumentPlacementDecision } from "../../../ports/state-repository-port.js";
import type { PendingFamilyFactArchiveDecision } from "../../../ports/state-repository-port.js";
import type { PendingFamilyFactDecision } from "../../../ports/state-repository-port.js";
import type { PendingFileDestinationDecision } from "../../../ports/state-repository-port.js";
import type { PendingFileDuplicateDecision } from "../../../ports/state-repository-port.js";
import type { StoreInboundFileResult } from "../file-inbox/store-inbound-file.js";
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
  FileDuplicateMutationDecision,
  ResolveFileDuplicateDecisionInput,
  ResolveFileDuplicateDecisionResult
} from "../file-inbox/resolve-file-duplicate-decision.js";
import type {
  InboundIntent,
  InboundIntentClassifier
} from "./classify-inbound-intent.js";
import type {
  PendingChoiceClassifier,
  PendingChoiceOption
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

export interface FamilyFactRecorder {
  execute(input: RecordFamilyFactInput): Promise<RecordFamilyFactResult>;
}

export interface FamilyFactRecall {
  execute(input: RecallFamilyFactsInput): Promise<{ readonly text: string }>;
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
  readonly familyFactRecorder?: FamilyFactRecorder;
  readonly familyFactRecall?: FamilyFactRecall;
  readonly familyFactArchiver?: FamilyFactArchiver;
  readonly documentRegistrar?: DocumentRegistrar;
  readonly documentLookup?: DocumentLookup;
  readonly documentManager?: DocumentManager;
  readonly documentPlacementMover?: DocumentPlacementMover;
  readonly documentFolderResolver?: DocumentFolderResolver;
  readonly subjectAliasManager?: SubjectAliasManager;
  readonly factDecisionResolver?: FamilyFactDecisionResolver;
  readonly pendingAccessRequests?: PendingAccessRequestReviewer;
  readonly adminSessionActivator?: AdminSessionActivator;
  readonly intentClassifier?: InboundIntentClassifier;
  readonly pendingChoiceClassifier?: PendingChoiceClassifier<PendingDecisionChoice>;
  readonly duplicateDecisionResolver?: FileDuplicateDecisionResolver;
  readonly pendingClarifications?: PendingClarificationStore;
  readonly pendingFileDuplicateDecisions?: PendingFileDuplicateDecisionStore;
  readonly pendingFileDestinationDecisions?: PendingFileDestinationDecisionStore;
  readonly pendingFamilyFactDecisions?: PendingFamilyFactDecisionStore;
  readonly pendingFamilyFactArchiveDecisions?: PendingFamilyFactArchiveDecisionStore;
  readonly pendingDocumentDecisions?: PendingDocumentDecisionStore;
  readonly pendingDocumentPlacementDecisions?: PendingDocumentPlacementDecisionStore;
  readonly now?: () => Date;
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

    if (input.route.kind === "pending_access_requests") {
      return this.listPendingAccessRequests(input.context.chat.id);
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

    const pendingDocument =
      await this.dependencies.pendingDocumentDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDocument && context.attachments.length === 0) {
      return this.dispatchPendingDocumentDecision(context, pendingDocument);
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
          text: context.text,
          attachments: context.attachments
        };
    let intent: InboundIntent;
    try {
      intent = await this.dependencies.intentClassifier!.execute({
        text: classifierInput.text,
        attachments: classifierInput.attachments
      });
    } catch {
      return this.dispatchModelFailure(context, classifierInput.attachments);
    }

    return this.dispatchClassifiedModelIntent({
      context,
      intent,
      pendingClarification: pending,
      attachments: classifierInput.attachments,
      allowFileOrClarification: true
    });
  }

  private async dispatchFamilyMessageWithoutModel(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    const now = this.dependencies.now?.() ?? new Date();
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

    const pendingDocument =
      await this.dependencies.pendingDocumentDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDocument && context.attachments.length === 0) {
      return this.dispatchPendingDocumentDecision(context, pendingDocument);
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

    return {
      chatId: context.chat.id,
      text: `Saved family fact: ${result.fact.body}`
    };
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

    return {
      chatId: context.chat.id,
      text: intent?.summary
        ? `Saved ${storedRecords.length} attachment(s): ${intent.summary}.`
        : `Saved ${storedRecords.length} attachment(s).`
    };
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

    if (
      !metadata.documentType &&
      !metadata.subjectId &&
      this.dependencies.documentSearchDescriptionRecorder
    ) {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "describe_for_search" },
        candidates: uploadedDocuments,
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
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingDocumentDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: { kind: "update_metadata" },
        candidates: uploadedDocuments,
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
      uploadedDocuments
    );

    return {
      chatId: context.chat.id,
      text: [
        formatUploadedDocumentsReply(uploadedDocuments),
        ...(placementSuggested
          ? formatPlacementSuggestionLines(uploadedDocuments[0])
          : [])
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

    if (intent.kind === "answer_from_memory") {
      return this.recallFamilyFacts(context, intent);
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
      return this.manageDocument(context, intent);
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
      ...(intent.subjectId ? { subjectId: intent.subjectId } : {})
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
    >
  ): Promise<OutboundReply> {
    if (!this.dependencies.documentManager) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.documentManager.execute(
      intent.kind === "archive_document"
        ? {
            action: "archive",
            query: intent.query
          }
        : {
            action: "update_metadata",
            query: intent.query,
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
      ...(pending.action.documentType
        ? { documentType: pending.action.documentType }
        : {}),
      ...(pending.action.subjectId ? { subjectId: pending.action.subjectId } : {})
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

function parseActorId(text: string): string | undefined {
  const [, actorId] = text.trim().split(/\s+/, 2);

  return actorId;
}

function buildClarificationClassifierText(
  pending: PendingClarification,
  followUpText: string
): string {
  return [
    `Previous message: ${pending.originalText}`,
    `Assistant asked: ${pending.question}`,
    `User clarification: ${followUpText}`
  ].join("\n");
}

function buildPendingFileDestinationInterruptionClassifierText(
  pending: PendingFileDestinationDecision,
  followUpText: string
): string {
  const names = pending.attachments
    .map((attachment) => attachment.fileName)
    .filter((value): value is string => Boolean(value));
  const fileList = names.length > 0 ? names.join(", ") : "uploaded attachment(s)";

  return [
    `Pending operation: choose where to save uploaded file(s): ${fileList}.`,
    "The user can continue it by choosing local inbox or Google Drive.",
    "If the current reply is a separate command, classify that command normally.",
    `User reply: ${followUpText}`
  ].join("\n");
}

function buildPendingDocumentPlacementInterruptionClassifierText(
  pending: PendingDocumentPlacementDecision,
  followUpText: string
): string {
  return [
    `Pending operation: decide whether to move document ${pending.document.name}.`,
    `Suggested folder: ${pending.targetFolderPath}.`,
    "The user can continue it by accepting the move or skipping it.",
    "If the current reply is a separate command, classify that command normally.",
    `User reply: ${followUpText}`
  ].join("\n");
}

function mergeAttachments(
  previous: readonly MessageAttachment[],
  current: readonly MessageAttachment[]
): readonly MessageAttachment[] {
  const seen = new Set<string>();
  const merged: MessageAttachment[] = [];

  for (const attachment of [...previous, ...current]) {
    if (seen.has(attachment.id)) {
      continue;
    }

    seen.add(attachment.id);
    merged.push(attachment);
  }

  return merged;
}

function duplicateAttachmentReply(
  duplicates: readonly Extract<StoreInboundFileResult, { status: "duplicate" }>[]
): string {
  const [first] = duplicates;

  if (!first) {
    return "Такой файл уже есть.";
  }

  return duplicateDecisionPrompt(first.fileName, suggestCopyName(first.fileName));
}

function attachmentIoErrorMessage(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);

  if (/exceeds max size/u.test(message)) {
    return "Attachment is too large for current safety limits. File was not saved.";
  }

  if (/timed out after/u.test(message)) {
    return "Attachment transfer timed out. File was not saved; please try again later.";
  }

  return undefined;
}

function sourceAttachmentForDuplicate(
  attachments: readonly MessageAttachment[],
  fileName: string
): { readonly sourceAttachment: MessageAttachment } | Record<string, never> {
  const sourceAttachment =
    attachments.find((attachment) => attachment.fileName === fileName) ??
    attachments.find((attachment) => Boolean(attachment.providerFileId));

  return sourceAttachment ? { sourceAttachment } : {};
}

function suggestCopyName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${fileName} (2)`;
  }

  return `${fileName.slice(0, extensionIndex)} (2)${fileName.slice(extensionIndex)}`;
}

export type DuplicateDecision = "copy" | "overwrite" | "skip";
type FileUploadDestination = "local_inbox" | "google_drive";
type PendingDecisionChoice = DuplicateDecision | FamilyFactDecision | PlacementDecision;
type PendingRoutingEventAttributes = {
  readonly pendingKind:
    | "file_destination"
    | "file_duplicate"
    | "document_placement";
  readonly policy: PendingDecisionPolicy;
  readonly choiceResult: string;
  readonly interruptionIntent?: string;
  readonly pendingCleared: boolean;
};
const fileDestinationDecisionPolicy =
  "safe_interruptible" satisfies PendingDecisionPolicy;
const documentPlacementDecisionPolicy =
  "safe_interruptible" satisfies PendingDecisionPolicy;

const duplicateDecisionOptions: readonly PendingChoiceOption<DuplicateDecision>[] = [
  {
    value: "copy",
    label: "сохранить копию",
    description: "Save a second file under the suggested copy name."
  },
  {
    value: "overwrite",
    label: "перезаписать существующий файл",
    description: "Replace the existing file."
  },
  {
    value: "skip",
    label: "ничего не делать",
    description: "Leave the existing file unchanged."
  }
];

const placementDecisionOptions: readonly PendingChoiceOption<PlacementDecision>[] = [
  {
    value: "accept",
    label: "переместить файл",
    description: "Move the document to the suggested folder."
  },
  {
    value: "skip",
    label: "оставить как есть",
    description: "Leave the document in its current folder."
  }
];

function duplicateDecisionPrompt(
  fileName: string,
  suggestedCopyName: string
): string {
  return [
    `Файл уже есть: ${fileName}.`,
    "Что сделать?",
    `- сохранить копию как ${suggestedCopyName}`,
    "- перезаписать существующий файл",
    "- ничего не делать"
  ].join("\n");
}

function parseFileUploadDestination(
  text: string
): FileUploadDestination | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(google\s*drive|drive)\b/.test(normalized) ||
    /гугл\s*диск|google\s*диск|диск|гугл/.test(normalized)
  ) {
    return "google_drive";
  }

  if (
    /\b(local|inbox|locally)\b/.test(normalized) ||
    /локаль|инбокс|входящ|на сервер/.test(normalized)
  ) {
    return "local_inbox";
  }

  return undefined;
}

function parseModelFileUploadDestination(
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): FileUploadDestination | undefined {
  return intent?.destination;
}

function resolveFileUploadDestinationForModelIntent(
  text: string,
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): FileUploadDestination | undefined {
  const deterministicDestination = parseFileUploadDestination(text);

  if (deterministicDestination) {
    return deterministicDestination;
  }

  const modelDestination = parseModelFileUploadDestination(intent);

  return modelDestination === "google_drive" ? modelDestination : undefined;
}

function canUseLocalFileStorage(context: AcceptedMessageContext): boolean {
  return context.actor.role === "owner";
}

function parseModelDocumentMetadata(
  intent: Extract<InboundIntent, { readonly kind: "store_file" }> | undefined
): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  return {
    ...(intent?.documentType ? { documentType: intent.documentType } : {}),
    ...(intent?.subjectId ? { subjectId: intent.subjectId } : {})
  };
}

function fileDestinationPrompt(attachments: readonly MessageAttachment[]): string {
  const names = attachments
    .map((attachment) => attachment.fileName)
    .filter((value): value is string => Boolean(value));

  return [
    names.length > 0
      ? `Куда сохранить файл: ${names.join(", ")}?`
      : "Куда сохранить вложение?",
    "Можно ответить:",
    "- local inbox",
    "- Google Drive"
  ].join("\n");
}

const documentTypes = [
  "identity",
  "legal",
  "health",
  "finance",
  "education",
  "travel",
  "home",
  "reference",
  "other"
] as const satisfies readonly DocumentType[];

function parseDocumentMetadata(text: string): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  const normalized = text.trim().toLowerCase();
  const tokens = normalized
    .split(/[^a-zа-яё0-9_-]+/u)
    .filter((token) => token.length > 0);
  const documentType = parseDocumentType(tokens);
  const subjectId = parseDocumentSubject(tokens);

  return {
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

function mergeDocumentMetadata(
  deterministic: {
    readonly documentType?: DocumentType;
    readonly subjectId?: string;
  },
  fallback: {
    readonly documentType?: DocumentType;
    readonly subjectId?: string;
  }
): {
  readonly documentType?: DocumentType;
  readonly subjectId?: string;
} {
  if (!fallback.documentType && !fallback.subjectId) {
    return deterministic;
  }

  const documentType = deterministic.documentType ?? fallback.documentType;
  const subjectId = deterministic.documentType
    ? deterministic.subjectId ?? fallback.subjectId
    : fallback.subjectId;

  return {
    ...(documentType ? { documentType } : {}),
    ...(subjectId ? { subjectId } : {})
  };
}

function parseDocumentType(tokens: readonly string[]): DocumentType | undefined {
  for (const token of tokens) {
    if ((documentTypes as readonly string[]).includes(token)) {
      return token as DocumentType;
    }

    if (
      token === "passport" ||
      token === "id" ||
      token === "карта" ||
      token === "удостоверение"
    ) {
      return "identity";
    }

    if (token === "visa" || token === "ticket") {
      return "travel";
    }
  }

  return undefined;
}

function parseDocumentSubject(tokens: readonly string[]): string | undefined {
  const ignored = new Set([
    ...documentTypes,
    "google",
    "drive",
    "local",
    "inbox",
    "save",
    "store",
    "upload",
    "uploaded",
    "put",
    "file",
    "document",
    "this",
    "it",
    "to",
    "in",
    "as",
    "for",
    "passport",
    "id",
    "карта",
    "личная",
    "удостоверение",
    "visa",
    "ticket",
    "гугл",
    "диск",
    "файл",
    "документ",
    "сохрани",
    "загрузи",
    "для",
    "как",
    "это",
    "в"
  ]);

  return tokens.find(
    (token) =>
      !ignored.has(token) &&
      /^[a-zа-яё][a-zа-яё0-9_-]{1,31}$/u.test(token)
  );
}

function parseSkipDocumentMetadata(text: string): boolean {
  const normalized = text.trim().toLowerCase();

  return (
    /\b(skip|cancel|nothing|later)\b/.test(normalized) ||
    /пропусти|отмена|ничего|потом|не надо/.test(normalized)
  );
}

function isUploadedDocumentMetadataDecision(
  pending: PendingDocumentDecision
): boolean {
  return (
    pending.action.kind === "update_metadata" &&
    !pending.action.documentType &&
    !pending.action.subjectId &&
    pending.candidates.length > 0
  );
}

function formatUploadedDocumentsReply(
  documents: readonly RegisterDocumentResult["document"][]
): string {
  return [
    `Uploaded ${documents.length} document(s) to Google Drive:`,
    ...documents.map(formatUploadedDocumentLine)
  ].join("\n");
}

function formatUploadedDocumentLine(
  document: RegisterDocumentResult["document"]
): string {
  const metadata = [
    document.documentType,
    document.subjectId ? `subject: ${document.subjectId}` : undefined
  ].filter((value): value is string => Boolean(value));
  const name = metadata.length > 0
    ? `${document.name} (${metadata.join(", ")})`
    : document.name;

  return `- ${name}\n  ${document.url}`;
}

function formatUploadFolderChoicePrompt(
  choice: Extract<
    StoreMessageDocumentAttachmentResult,
    { readonly status: "needs_folder_choice" }
  >
): string {
  return [
    `Куда сохранить ${choice.attachment.fileName}?`,
    `Выбрана папка ${choice.parentPath}, но в ней есть подпапки:`,
    ...choice.options.map((option, index) => `${index + 1}. ${option.path}`),
    "Ответь номером, названием папки или \"отмена\"."
  ].join("\n");
}

function parseUploadFolderChoice(
  text: string,
  options: readonly { readonly path: string; readonly folderId: string }[]
): { readonly path: string; readonly folderId: string } | "cancel" | undefined {
  const normalized = text.trim().toLowerCase();

  if (/^(cancel|skip|отмена|отмени|не надо)$/u.test(normalized)) {
    return "cancel";
  }

  const numeric = Number.parseInt(normalized, 10);

  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1];
  }

  return options.find((option) => {
    const path = option.path.toLowerCase();
    const lastSegment = path.split("/").at(-1)?.toLowerCase();

    return path.includes(normalized) || lastSegment === normalized;
  });
}

function formatDocumentSearchDescriptionResult(
  document: RegisterDocumentResult["document"],
  result: RecordDocumentSearchDescriptionResult
): string {
  return result.status === "stored"
    ? `Сохранил описание для поиска: ${document.name}.`
    : `Документ сохранен, но описание для поиска пока не записано: ${document.name}.`;
}

function canonicalDocumentFolderPath(
  document: PendingDocumentPlacementDecision["document"]
): string {
  return [
    "Family Documents",
    document.subjectId ?? "family",
    document.documentType ?? "other"
  ].join("/");
}

function formatPlacementSuggestionLines(
  document: PendingDocumentPlacementDecision["document"] | undefined
): string[] {
  if (!document) {
    return [];
  }

  const targetFolderPath = canonicalDocumentFolderPath(document);

  return [
    `Предлагаю папку: ${targetFolderPath}`,
    "Переместить файл туда? Ответь yes или skip."
  ];
}

function placementDecisionPrompt(
  pending: PendingDocumentPlacementDecision
): string {
  return [
    `Я жду решение по размещению ${pending.document.name}.`,
    `Предлагаемая папка: ${pending.targetFolderPath}`,
    "Можно ответить yes или skip."
  ].join("\n");
}

type PlacementDecision = "accept" | "skip";

function parsePlacementDecision(text: string): PlacementDecision | undefined {
  const normalized = text.trim().toLowerCase();
  const tokens = normalized
    .split(/[^a-zа-яё0-9_-]+/u)
    .filter((token) => token.length > 0);

  if (
    /\b(yes|ok|move|accept|confirm)\b/.test(normalized) ||
    tokens.includes("да") ||
    tokens.includes("ок") ||
    /перемести|подтверж|соглас/.test(normalized)
  ) {
    return "accept";
  }

  if (
    /\b(no|skip|cancel|nothing|later)\b/.test(normalized) ||
    tokens.includes("нет") ||
    /пропусти|отмена|ничего|потом|не надо/.test(normalized)
  ) {
    return "skip";
  }

  return undefined;
}

function formatRegisteredDocumentReply(
  document: RegisterDocumentResult["document"]
): string {
  const metadata = [
    document.documentType,
    document.subjectId ? `subject: ${document.subjectId}` : undefined
  ].filter((value): value is string => Boolean(value));

  if (metadata.length === 0) {
    return `Registered document: ${document.name}`;
  }

  return `Registered document: ${document.name} (${metadata.join(", ")})`;
}

function parseDuplicateDecision(text: string): DuplicateDecision | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(copy|duplicate)\b/.test(normalized) ||
    /копи|дубликат|сохрани.*коп/.test(normalized)
  ) {
    return "copy";
  }

  if (
    /\b(overwrite|replace)\b/.test(normalized) ||
    /перезап|замен|перепиш/.test(normalized)
  ) {
    return "overwrite";
  }

  if (
    /\b(skip|nothing|cancel)\b/.test(normalized) ||
    /ничего|отмен|не надо|забей/.test(normalized)
  ) {
    return "skip";
  }

  return undefined;
}

const familyFactDecisionOptions: readonly PendingChoiceOption<FamilyFactDecision>[] = [
  {
    value: "update",
    label: "обновить существующий факт",
    description: "Update the existing family fact with the new wording."
  },
  {
    value: "create",
    label: "создать новый факт",
    description: "Save the new memory as a separate family fact."
  },
  {
    value: "cancel",
    label: "отменить изменение",
    description: "Leave family memory unchanged."
  }
];

function familyFactDecisionPrompt(pending: PendingFamilyFactDecision): string {
  return [
    "Нужно решить, что сделать с семейным фактом.",
    `Новый факт: ${pending.newFact.body}`,
    "Похожие существующие факты:",
    ...pending.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
    "Что сделать?",
    "- обновить существующий факт",
    "- создать новый факт",
    "- отменить изменение"
  ].join("\n");
}

function parseFamilyFactDecision(
  text: string
): { readonly decision: FamilyFactDecision; readonly candidateIndex?: number } | undefined {
  const normalized = text.trim().toLowerCase();
  const candidateIndex = parseCandidateIndex(normalized);

  if (
    /\b(update|replace)\b/.test(normalized) ||
    /обнов|замен|перезап/.test(normalized)
  ) {
    return {
      decision: "update",
      ...(candidateIndex !== undefined ? { candidateIndex } : {})
    };
  }

  if (
    /\b(create|new|separate)\b/.test(normalized) ||
    /созд|нов|отдельн/.test(normalized)
  ) {
    return {
      decision: "create"
    };
  }

  if (
    /\b(cancel|skip|nothing)\b/.test(normalized) ||
    /отмен|ничего|не надо|забей/.test(normalized)
  ) {
    return {
      decision: "cancel"
    };
  }

  return undefined;
}

function parseFamilyFactArchiveDecision(
  text: string
): number | "cancel" | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(cancel|skip|nothing)\b/.test(normalized) ||
    /отмен|ничего|не надо|забей/.test(normalized)
  ) {
    return "cancel";
  }

  return parseCandidateIndex(normalized);
}

function parseCandidateIndex(normalizedText: string): number | undefined {
  const numeric = normalizedText.match(/\b([1-9]\d*)\b/);

  if (numeric) {
    return Number(numeric[1]) - 1;
  }

  if (/\b(second|2nd)\b|втор/.test(normalizedText)) {
    return 1;
  }

  if (/\b(third|3rd)\b|трет/.test(normalizedText)) {
    return 2;
  }

  if (/\b(first|1st)\b|перв/.test(normalizedText)) {
    return 0;
  }

  return undefined;
}

function toSubjectAliasAction(
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
): ManageSubjectAliasesInput {
  if (intent.kind === "save_subject_alias") {
    return {
      action: "save",
      aliasSubjectId: intent.aliasSubjectId,
      canonicalSubjectId: intent.canonicalSubjectId
    };
  }

  if (intent.kind === "delete_subject_alias") {
    return {
      action: "delete",
      aliasSubjectId: intent.aliasSubjectId
    };
  }

  if (intent.kind === "diagnose_subject_aliases") {
    return {
      action: "diagnose"
    };
  }

  return {
    action: "list"
  };
}

function requiredAccessActionForIntent(
  intent: InboundIntent
): AccessAction | undefined {
  if (
    intent.kind === "store_file" ||
    intent.kind === "record_fact" ||
    intent.kind === "archive_fact" ||
    intent.kind === "register_document" ||
    intent.kind === "update_document" ||
    intent.kind === "archive_document" ||
    intent.kind === "save_subject_alias" ||
    intent.kind === "delete_subject_alias"
  ) {
    return "family_write";
  }

  return undefined;
}

function parseAdminSecret(text: string): string | undefined {
  const match = /^(?:\/admin|admin)\s+(.+)$/i.exec(text.trim());
  const secret = match?.[1]?.trim();

  return secret || undefined;
}

function formatFamilyFactConfirmation(
  result: Extract<RecordFamilyFactResult, { readonly status: "needs_confirmation" }>
): string {
  return [
    "This may update an existing family fact.",
    `New fact: ${result.newFact.body}`,
    "Existing candidates:",
    ...result.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
    "Reply whether to update an existing fact or create a new one."
  ].join("\n");
}
