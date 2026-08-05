import type { AccessAction } from "../../../core/domain/identity/access-policy.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { PendingShoppingItemDecision } from "../../../ports/state-repository-port.js";
import type { PendingChoiceClassifier, PendingChoiceOption } from "../messaging/classify-pending-choice.js";
import type { InboundIntent } from "../messaging/classify-inbound-intent.js";
import type { AcceptedMessageContext } from "../messaging/process-inbound-message.js";
import { resolvePendingDecision } from "../messaging/resolve-pending-decision.js";
import type {
  ManageShoppingItemInput,
  ManageShoppingItemResult
} from "./manage-shopping-item.js";
import type {
  RecallShoppingItemsInput,
  RecallShoppingItemsResult
} from "./recall-shopping-items.js";
import type {
  RecordShoppingItemInput,
  RecordShoppingItemResult
} from "./record-shopping-item.js";

export type ShoppingIntent = Extract<
  InboundIntent,
  {
    readonly kind:
      | "record_shopping_item"
      | "recall_shopping_items"
      | "manage_shopping_item";
  }
>;

export type ShoppingItemDecision = `item_${number}` | "cancel";

export interface ShoppingCommandRail {
  readonly action: AccessAction;
  readonly intent: ShoppingIntent;
}

export interface ShoppingRecorder {
  execute(input: RecordShoppingItemInput): Promise<RecordShoppingItemResult>;
}

export interface ShoppingRecall {
  execute(input: RecallShoppingItemsInput): Promise<RecallShoppingItemsResult>;
}

export interface ShoppingManager {
  execute(input: ManageShoppingItemInput): Promise<ManageShoppingItemResult>;
}

export interface PendingShoppingItemDecisionStore {
  findActiveByChatId(
    chatId: string,
    now: Date
  ): Promise<PendingShoppingItemDecision | undefined>;
  save(input: PendingShoppingItemDecision): Promise<void>;
  clearByChatId(chatId: string): Promise<void>;
}

export interface DispatchShoppingRequestDependencies {
  readonly shoppingRecorder?: ShoppingRecorder;
  readonly shoppingRecall?: ShoppingRecall;
  readonly shoppingManager?: ShoppingManager;
  readonly pendingShoppingItemDecisions?: PendingShoppingItemDecisionStore;
  readonly pendingChoiceClassifier?: PendingChoiceClassifier<ShoppingItemDecision>;
  readonly now?: () => Date;
}

export class DispatchShoppingRequestUseCase {
  constructor(
    private readonly dependencies: DispatchShoppingRequestDependencies
  ) {}

  async dispatchIntent(
    context: AcceptedMessageContext,
    intent: ShoppingIntent
  ): Promise<OutboundReply> {
    if (intent.kind === "record_shopping_item") {
      return this.recordShoppingItem(context, intent);
    }

    if (intent.kind === "recall_shopping_items") {
      return this.recallShoppingItems(context, intent);
    }

    return this.manageShoppingItem(context, intent);
  }

  async dispatchPendingDecision(
    context: AcceptedMessageContext,
    pending: PendingShoppingItemDecision
  ): Promise<OutboundReply> {
    const decision = await resolvePendingDecision<ShoppingItemDecision>({
      policy: "choice_only",
      prompt: shoppingItemDecisionPrompt(pending),
      userReply: context.text,
      options: shoppingItemDecisionOptions(pending),
      parseDeterministicChoice: (text) =>
        parseShoppingItemDecision(text, pending),
      classifier: this.dependencies.pendingChoiceClassifier
    });

    if (decision === undefined) {
      return {
        chatId: context.chat.id,
        text: [
          "Я жду выбор покупки.",
          "Можно написать номер позиции или \"отмена\"."
        ].join("\n")
      };
    }

    if (decision === "cancel") {
      await this.dependencies.pendingShoppingItemDecisions?.clearByChatId(
        context.chat.id
      );

      return {
        chatId: context.chat.id,
        text: "Ок, не меняю покупку."
      };
    }

    if (!this.dependencies.shoppingManager) {
      return {
        chatId: context.chat.id,
        text: "Shopping item manager is not configured."
      };
    }

    const candidate = shoppingItemCandidateForDecision(pending, decision);

    if (!candidate) {
      return {
        chatId: context.chat.id,
        text: "I could not find that shopping item candidate anymore."
      };
    }

    const result = await this.dependencies.shoppingManager.execute({
      action: pending.action,
      query: candidate.title,
      shoppingItemId: candidate.id
    });
    await this.dependencies.pendingShoppingItemDecisions?.clearByChatId(
      context.chat.id
    );

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async recordShoppingItem(
    context: AcceptedMessageContext,
    intent: Extract<ShoppingIntent, { readonly kind: "record_shopping_item" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.shoppingRecorder) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.shoppingRecorder.execute({
      title: intent.title,
      ...(intent.storeHint ? { storeHint: intent.storeHint } : {}),
      ...(intent.projectTag ? { projectTag: intent.projectTag } : {}),
      tags: intent.tags ?? [],
      sourceActorId: context.actor.id,
      sourceChatId: context.chat.id,
      sourceMessageText: context.text
    });

    return {
      chatId: context.chat.id,
      text: `Сохранил покупку: ${result.item.title}`
    };
  }

  private async recallShoppingItems(
    context: AcceptedMessageContext,
    intent: Extract<ShoppingIntent, { readonly kind: "recall_shopping_items" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.shoppingRecall) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.shoppingRecall.execute({
      query: intent.query
    });

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  private async manageShoppingItem(
    context: AcceptedMessageContext,
    intent: Extract<ShoppingIntent, { readonly kind: "manage_shopping_item" }>
  ): Promise<OutboundReply> {
    if (!this.dependencies.shoppingManager) {
      return {
        chatId: context.chat.id,
        text: `I understood this as ${intent.kind}, but that action is not connected yet.`
      };
    }

    const result = await this.dependencies.shoppingManager.execute({
      action: intent.action,
      query: intent.query
    });

    if (result.status === "ambiguous") {
      const now = this.dependencies.now?.() ?? new Date();
      await this.dependencies.pendingShoppingItemDecisions?.save({
        chatId: context.chat.id,
        actorId: context.actor.id,
        action: intent.action,
        candidates: result.items,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000)
      });
    }

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }
}

export function isShoppingIntent(intent: InboundIntent): intent is ShoppingIntent {
  return (
    intent.kind === "record_shopping_item" ||
    intent.kind === "recall_shopping_items" ||
    intent.kind === "manage_shopping_item"
  );
}

export function parseShoppingCommandRail(
  text: string
): ShoppingCommandRail | undefined {
  const lifecycle = parseShoppingLifecycleCommandRail(text);
  if (lifecycle) {
    return {
      action: "family_write",
      intent: lifecycle
    };
  }

  const write = parseShoppingWriteCommandRail(text);
  if (write) {
    return {
      action: "family_write",
      intent: write
    };
  }

  const query = parseFindShoppingCommandRail(text);
  if (query) {
    return {
      action: "family_read",
      intent: query
    };
  }

  return undefined;
}

function parseShoppingWriteCommandRail(
  text: string
): Extract<ShoppingIntent, { readonly kind: "record_shopping_item" }> | undefined {
  const commandText = stripCommandRail(text, ["shop", "buy"]);

  if (!commandText) {
    return undefined;
  }

  const tags = parseHashTags(commandText);
  const storeHint = shoppingStoreHint(commandText);
  const projectTag = /(^|[\s,])ремонт([\s,]|$)|\bremont\b|\brepair\b/iu.test(
    commandText
  )
    ? "ремонт"
    : undefined;
  const title = cleanupShoppingTitle(commandText);

  if (!title) {
    return undefined;
  }

  return {
    kind: "record_shopping_item",
    title,
    ...(storeHint ? { storeHint } : {}),
    ...(projectTag ? { projectTag } : {}),
    tags
  };
}

function parseShoppingLifecycleCommandRail(
  text: string
): Extract<ShoppingIntent, { readonly kind: "manage_shopping_item" }> | undefined {
  const commandText = stripCommandRail(text, ["shop"]);

  if (!commandText) {
    return undefined;
  }

  const boughtMatch = commandText.match(
    /^(?:bought|done|got|купил|купила|купили|куплено|готово)\s+(.+)$/iu
  );
  if (boughtMatch?.[1]?.trim()) {
    return {
      kind: "manage_shopping_item",
      action: "mark_bought",
      query: boughtMatch[1].trim()
    };
  }

  const archiveMatch = commandText.match(
    /^(?:archive|remove|hide|cancel|убери|удали|архив|в\s+архив)\s+(.+)$/iu
  );
  if (archiveMatch?.[1]?.trim()) {
    return {
      kind: "manage_shopping_item",
      action: "archive",
      query: archiveMatch[1].trim()
    };
  }

  return undefined;
}

function parseFindShoppingCommandRail(
  text: string
): Extract<ShoppingIntent, { readonly kind: "recall_shopping_items" }> | undefined {
  const query = stripCommandRail(text, ["find", "search"]);

  if (!query || !looksLikeShoppingQuery(query)) {
    return undefined;
  }

  return {
    kind: "recall_shopping_items",
    query
  };
}

function shoppingItemDecisionPrompt(
  pending: PendingShoppingItemDecision
): string {
  return [
    "Я жду выбор покупки.",
    ...pending.candidates.map((item, index) => `${index + 1}. ${item.title}`),
    "Можно ответить номером позиции или отмена."
  ].join("\n");
}

function shoppingItemDecisionOptions(
  pending: PendingShoppingItemDecision
): readonly PendingChoiceOption<ShoppingItemDecision>[] {
  return [
    ...pending.candidates.map((item, index) => ({
      value: shoppingItemDecisionValue(index),
      label: `${index + 1}. ${item.title}`,
      description: "Select this shopping item."
    })),
    {
      value: "cancel" as const,
      label: "отмена",
      description: "Do not change any shopping item."
    }
  ];
}

function parseShoppingItemDecision(
  text: string,
  pending: PendingShoppingItemDecision
): ShoppingItemDecision | undefined {
  const normalized = text.trim().toLowerCase();

  if (
    /\b(cancel|skip|nothing)\b/.test(normalized) ||
    /отмен|ничего|не надо|забей/.test(normalized)
  ) {
    return "cancel";
  }

  const candidateIndex = parseCandidateIndex(normalized);

  if (
    candidateIndex === undefined ||
    candidateIndex < 0 ||
    candidateIndex >= pending.candidates.length
  ) {
    return undefined;
  }

  return shoppingItemDecisionValue(candidateIndex);
}

function shoppingItemCandidateForDecision(
  pending: PendingShoppingItemDecision,
  decision: ShoppingItemDecision
): PendingShoppingItemDecision["candidates"][number] | undefined {
  if (decision === "cancel") {
    return undefined;
  }

  const index = Number(decision.replace("item_", "")) - 1;

  if (!Number.isInteger(index)) {
    return undefined;
  }

  return pending.candidates[index];
}

function shoppingItemDecisionValue(index: number): ShoppingItemDecision {
  return `item_${index + 1}`;
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

function stripCommandRail(
  text: string,
  commands: readonly string[]
): string | undefined {
  const trimmed = text.trim();
  const commandPattern = commands.join("|");
  const match = trimmed.match(new RegExp(`^/?(?:${commandPattern})\\b`, "iu"));

  if (!match) {
    return undefined;
  }

  return trimmed.slice(match[0].length).trim();
}

function parseHashTags(text: string): readonly string[] {
  return [...text.matchAll(/#([\p{L}\p{N}_-]+)/giu)]
    .map((match) => match[1])
    .filter((tag): tag is string => typeof tag === "string");
}

function shoppingStoreHint(text: string): string | undefined {
  if (/уради\s*сам|uradi\s*sam|uradisam/iu.test(text)) {
    return "uradi_sam";
  }

  return undefined;
}

function cleanupShoppingTitle(text: string): string {
  return text
    .replace(/#[\p{L}\p{N}_-]+/giu, " ")
    .replace(/\b(buy|get)\b/giu, " ")
    .replace(/\b(in|at|from)\s+(uradi\s*sam|uradisam)\b/giu, " ")
    .replace(/купить|возьми|взять|приобрести/giu, " ")
    .replace(/(^|\s)в\s+(уради\s*сам|uradisam)(?=\s|$)/giu, " ")
    .replace(/(^|[\s,])ремонт([\s,]|$)/giu, " ")
    .replace(/\s+/gu, " ")
    .replace(/^[,.:;\s]+|[,.:;\s]+$/gu, "")
    .trim();
}

function looksLikeShoppingQuery(text: string): boolean {
  return /купить|покуп|магазин|уради\s*сам|uradisam|uradi\s*sam|ремонт|repair|shop|buy/iu.test(
    text
  );
}
