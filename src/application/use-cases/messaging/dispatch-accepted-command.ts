import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { PendingAccessRequest } from "../../../ports/identity-access-repository-port.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { PendingClarification } from "../../../ports/state-repository-port.js";
import type { PendingFamilyFactDecision } from "../../../ports/state-repository-port.js";
import type { PendingFileDuplicateDecision } from "../../../ports/state-repository-port.js";
import type { StoreInboundFileResult } from "../file-inbox/store-inbound-file.js";
import type { RecallFamilyFactsInput } from "../family-memory/recall-family-facts.js";
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

export interface FamilyFactRecorder {
  execute(input: RecordFamilyFactInput): Promise<RecordFamilyFactResult>;
}

export interface FamilyFactRecall {
  execute(input: RecallFamilyFactsInput): Promise<{ readonly text: string }>;
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

export interface PendingFamilyFactDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingFamilyFactDecision | undefined>;
  save(input: PendingFamilyFactDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface DispatchAcceptedCommandInput {
  readonly route: CommandRoute;
  readonly context: AcceptedMessageContext;
}

export interface DispatchAcceptedCommandDependencies {
  readonly systemHealthHandler: SystemHealthCommandHandler;
  readonly attachmentStore?: MessageAttachmentStore;
  readonly familyFactRecorder?: FamilyFactRecorder;
  readonly familyFactRecall?: FamilyFactRecall;
  readonly subjectAliasManager?: SubjectAliasManager;
  readonly factDecisionResolver?: FamilyFactDecisionResolver;
  readonly pendingAccessRequests?: PendingAccessRequestReviewer;
  readonly intentClassifier?: InboundIntentClassifier;
  readonly pendingChoiceClassifier?: PendingChoiceClassifier<PendingDecisionChoice>;
  readonly duplicateDecisionResolver?: FileDuplicateDecisionResolver;
  readonly pendingClarifications?: PendingClarificationStore;
  readonly pendingFileDuplicateDecisions?: PendingFileDuplicateDecisionStore;
  readonly pendingFamilyFactDecisions?: PendingFamilyFactDecisionStore;
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

    const pendingFamilyFact =
      await this.dependencies.pendingFamilyFactDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingFamilyFact && context.attachments.length === 0) {
      return this.dispatchPendingFamilyFactDecision(context, pendingFamilyFact);
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

    if (intent.kind === "record_fact") {
      return this.recordFamilyFact(context, intent);
    }

    if (intent.kind === "answer_from_memory") {
      return this.recallFamilyFacts(context, intent);
    }

    if (
      intent.kind === "save_subject_alias" ||
      intent.kind === "list_subject_aliases" ||
      intent.kind === "delete_subject_alias" ||
      intent.kind === "diagnose_subject_aliases"
    ) {
      return this.manageSubjectAliases(context, intent);
    }

    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  private async dispatchFamilyMessageWithoutModel(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    const now = this.dependencies.now?.() ?? new Date();
    const pendingFamilyFact =
      await this.dependencies.pendingFamilyFactDecisions?.findActiveByChatId(
        context.chat.id,
        now
      );

    if (pendingFamilyFact && context.attachments.length === 0) {
      return this.dispatchPendingFamilyFactDecision(context, pendingFamilyFact);
    }

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

  private async dispatchPendingDuplicateDecision(
    context: AcceptedMessageContext,
    pending: PendingFileDuplicateDecision
  ): Promise<OutboundReply> {
    const decision =
      parseDuplicateDecision(context.text) ??
      (await this.classifyPendingDuplicateDecision(context.text, pending));

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

    const result = await this.resolveDuplicateMutation(decision, pending);

    if (result.status === "copied") {
      return {
        chatId: context.chat.id,
        text: `Готово: сохранил копию как ${pending.suggestedCopyName}.`
      };
    }

    if (result.status === "overwritten") {
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

  private async dispatchPendingFamilyFactDecision(
    context: AcceptedMessageContext,
    pending: PendingFamilyFactDecision
  ): Promise<OutboundReply> {
    const parsedDecision =
      parseFamilyFactDecision(context.text) ??
      (await this.classifyPendingFamilyFactDecision(context.text, pending));

    if (!parsedDecision) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду решение по семейному факту.",
          "Можно написать: \"обнови существующий\", \"создай новый\" или \"отмена\"."
        ].join("\n")
      };
    }

    await this.dependencies.pendingFamilyFactDecisions?.clearByChatId(
      context.chat.id
    );

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

  private async classifyPendingDuplicateDecision(
    userReply: string,
    pending: PendingFileDuplicateDecision
  ): Promise<DuplicateDecision | undefined> {
    if (!this.dependencies.pendingChoiceClassifier) {
      return undefined;
    }

    try {
      return await this.dependencies.pendingChoiceClassifier.execute({
        prompt: duplicateDecisionPrompt(pending.fileName, pending.suggestedCopyName),
        userReply,
        options: duplicateDecisionOptions
      }) as DuplicateDecision | undefined;
    } catch {
      return undefined;
    }
  }

  private async classifyPendingFamilyFactDecision(
    userReply: string,
    pending: PendingFamilyFactDecision
  ): Promise<
    | { readonly decision: FamilyFactDecision; readonly candidateIndex?: number }
    | undefined
  > {
    if (!this.dependencies.pendingChoiceClassifier) {
      return undefined;
    }

    try {
      const decision = (await this.dependencies.pendingChoiceClassifier.execute({
        prompt: familyFactDecisionPrompt(pending),
        userReply,
        options: familyFactDecisionOptions
      })) as FamilyFactDecision | undefined;

      return decision ? { decision } : undefined;
    } catch {
      return undefined;
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
type PendingDecisionChoice = DuplicateDecision | FamilyFactDecision;

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
