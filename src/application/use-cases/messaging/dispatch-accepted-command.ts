import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { PendingAccessRequest } from "../../../ports/identity-access-repository-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { PendingClarification } from "../../../ports/state-repository-port.js";
import type { PendingFileDuplicateDecision } from "../../../ports/state-repository-port.js";
import type { StoreInboundFileResult } from "../file-inbox/store-inbound-file.js";
import type {
  InboundIntent,
  InboundIntentClassifier
} from "./classify-inbound-intent.js";
import type {
  PendingIdentityDecision,
  ReviewPendingIdentityResult
} from "../identity/review-pending-identity.js";
import type { StoreMessageAttachmentsInput } from "../file-inbox/store-message-attachments.js";
import type { HandleSystemHealthCommandInput } from "../health/handle-system-health-command.js";
import type { AcceptedMessageContext } from "./process-inbound-message.js";
import type { CommandRoute } from "./route-command.js";

export interface SystemHealthCommandHandler {
  execute(input: HandleSystemHealthCommandInput): Promise<OutboundReply>;
}

export interface MessageAttachmentStore {
  execute(
    input: StoreMessageAttachmentsInput
  ): Promise<readonly StoreInboundFileResult[]>;
}

export interface PendingAccessRequestReviewer {
  list(): Promise<readonly PendingAccessRequest[]>;
  review(input: {
    readonly actorId: string;
    readonly decision: PendingIdentityDecision;
  }): Promise<ReviewPendingIdentityResult>;
}

export interface PendingClarificationStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingClarification | undefined>;
  save(input: PendingClarification): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface PendingFileDuplicateDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFileDuplicateDecision | undefined>;
  save(input: PendingFileDuplicateDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface DispatchAcceptedCommandInput {
  readonly route: CommandRoute;
  readonly context: AcceptedMessageContext;
}

export interface DispatchAcceptedCommandDependencies {
  readonly systemHealthHandler: SystemHealthCommandHandler;
  readonly attachmentStore?: MessageAttachmentStore;
  readonly pendingAccessRequests?: PendingAccessRequestReviewer;
  readonly intentClassifier?: InboundIntentClassifier;
  readonly pendingClarifications?: PendingClarificationStore;
  readonly pendingFileDuplicateDecisions?: PendingFileDuplicateDecisionStore;
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
    const pendingDuplicate =
      await this.dependencies.pendingFileDuplicateDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingDuplicate && context.attachments.length === 0) {
      return this.dispatchPendingDuplicateDecision(context, pendingDuplicate);
    }

    const pending =
      await this.dependencies.pendingClarifications?.findActiveByChatId(
        context.chat.id,
        now
      );
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

    if (intent.kind === "ask_clarification") {
      await this.dependencies.pendingClarifications?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        originalText: pending?.originalText ?? context.text,
        originalAttachments: pending?.originalAttachments ?? context.attachments,
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
      await this.dependencies.pendingClarifications?.clearByChatId(
        context.chat.id
      );

      return this.storeFamilyMessageAttachments(
        {
          ...context,
          attachments: classifierInput.attachments
        },
        intent
      );
    }

    await this.dependencies.pendingClarifications?.clearByChatId(
      context.chat.id
    );

    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  private dispatchFamilyMessageWithoutModel(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    if (context.attachments.length > 0 && this.dependencies.attachmentStore) {
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

  private async storeFamilyMessageAttachments(
    context: AcceptedMessageContext,
    intent?: Extract<InboundIntent, { readonly kind: "store_file" }>
  ): Promise<OutboundReply> {
    if (context.attachments.length === 0) {
      return {
        chatId: context.chat.id,
        text: "I can store a file after you attach one."
      };
    }

    const results = await this.dependencies.attachmentStore?.execute({
      provider: context.provider,
      receivedAt: context.receivedAt,
      attachments: context.attachments
    });

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

  private async dispatchPendingDuplicateDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision
  ): Promise<OutboundReply> {
    const decision = parseDuplicateDecision(context.text);

    if (!decision) {
      return {
        chatId: context.chat.id,
        text: [
          `Я жду решение по файлу ${pending.fileName}.`,
          `Можно написать: "сохрани копию", "перезапиши" или "ничего не делай".`
        ].join("\n")
      };
    }

    await this.dependencies.pendingFileDuplicateDecisions?.clearByChatId(
      context.chat.id
    );

    if (decision === "skip") {
      return {
        chatId: context.chat.id,
        text: `Ок, ничего не делаю с файлом ${pending.fileName}.`
      };
    }

    if (decision === "copy") {
      return {
        chatId: context.chat.id,
        text: `Понял: нужно сохранить копию как ${pending.suggestedCopyName}. Само сохранение копии пока не подключено.`
      };
    }

    return {
      chatId: context.chat.id,
      text: `Понял: нужно перезаписать ${pending.fileName}. Сама перезапись пока не подключена, поэтому существующий файл не изменял.`
    };
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

  return [
    `Файл уже есть: ${first.fileName}.`,
    "Что сделать?",
    `- сохранить копию как ${suggestCopyName(first.fileName)}`,
    "- перезаписать существующий файл",
    "- ничего не делать"
  ].join("\n");
}

function suggestCopyName(fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${fileName} (2)`;
  }

  return `${fileName.slice(0, extensionIndex)} (2)${fileName.slice(extensionIndex)}`;
}

type DuplicateDecision = "copy" | "overwrite" | "skip";

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
