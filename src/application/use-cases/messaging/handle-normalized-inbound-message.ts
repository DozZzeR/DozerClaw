import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import { redactSensitive } from "../../../core/domain/security/redact-sensitive.js";
import type { ConversationTurnRepositoryPort } from "../../../ports/conversation-turn-repository-port.js";
import type {
  DispatchAcceptedCommandInput
} from "./dispatch-accepted-command.js";
import type {
  ProcessInboundMessageInput,
  ProcessInboundMessageResult
} from "./process-inbound-message.js";
import type { MessageReceiptRepositoryPort } from "../../../ports/message-receipt-repository-port.js";
import { type CommandKind, routeCommand } from "./route-command.js";

const DEFAULT_CONVERSATION_TURN_TTL_MS = 60 * 60 * 1000;
const MAX_CONVERSATION_TURN_CHARS = 2500;

const SENSITIVE_EXCLUDED_COMMAND_KINDS: ReadonlySet<CommandKind> = new Set([
  "admin_mode_activate",
  "admin_write",
  "approve_access_request",
  "reject_access_request",
  "pending_access_requests",
  "system_health",
  "clear_context"
]);

export type HandleNormalizedInboundMessageInput = Omit<
  ProcessInboundMessageInput,
  "action"
>;

export interface MessagePipeline {
  execute(input: ProcessInboundMessageInput): Promise<ProcessInboundMessageResult>;
}

export interface AcceptedCommandDispatcher {
  execute(input: DispatchAcceptedCommandInput): Promise<OutboundReply>;
}

export interface HandleNormalizedInboundMessageDependencies {
  readonly pipeline: MessagePipeline;
  readonly dispatcher: AcceptedCommandDispatcher;
  readonly receipts?: MessageReceiptRepositoryPort;
  readonly conversationTurns?: ConversationTurnRepositoryPort;
  readonly conversationTurnTtlMs?: number;
}

export class HandleNormalizedInboundMessageUseCase {
  constructor(
    private readonly dependencies: HandleNormalizedInboundMessageDependencies
  ) {}

  async execute(
    input: HandleNormalizedInboundMessageInput
  ): Promise<OutboundReply> {
    const receiptKey = {
      provider: input.provider,
      providerChatId: input.providerChatId,
      messageId: input.messageId
    };
    const storedReply = await this.dependencies.receipts?.find(receiptKey);

    if (storedReply) {
      return storedReply;
    }

    const route = routeCommand(input.text);
    const pipelineResult = await this.dependencies.pipeline.execute({
      ...input,
      text: route.normalizedText,
      action: route.action
    });

    const reply =
      pipelineResult.status !== "accepted"
        ? pipelineResult.reply
        : await this.dependencies.dispatcher.execute({
            route,
            context: pipelineResult.context
          });

    await this.dependencies.receipts?.save({
      ...receiptKey,
      reply,
      processedAt: input.now
    });

    if (
      pipelineResult.status === "accepted" &&
      this.dependencies.conversationTurns &&
      !SENSITIVE_EXCLUDED_COMMAND_KINDS.has(route.kind)
    ) {
      await this.recordConversationExchange({
        chatId: pipelineResult.context.chat.id,
        actorId: pipelineResult.context.actor.id,
        userText: formatUserTurnText(
          pipelineResult.context.text,
          pipelineResult.context.attachments
        ),
        assistantText: sanitizeConversationTurnText(reply.text),
        sourceMessageKey: `${input.provider}:${input.providerChatId}:${input.messageId}`,
        now: input.now
      });
    }

    return reply;
  }

  private async recordConversationExchange(input: {
    readonly chatId: string;
    readonly actorId: string;
    readonly userText: string;
    readonly assistantText: string;
    readonly sourceMessageKey: string;
    readonly now: Date;
  }): Promise<void> {
    if (!this.dependencies.conversationTurns) {
      return;
    }

    const ttlMs =
      this.dependencies.conversationTurnTtlMs ??
      DEFAULT_CONVERSATION_TURN_TTL_MS;

    try {
      await this.dependencies.conversationTurns.appendTurns({
        chatId: input.chatId,
        createdAt: input.now,
        expiresAt: new Date(input.now.getTime() + ttlMs),
        turns: [
          {
            actorId: input.actorId,
            role: "user",
            text: input.userText,
            sourceMessageKey: input.sourceMessageKey
          },
          {
            role: "assistant",
            text: input.assistantText,
            sourceMessageKey: input.sourceMessageKey
          }
        ]
      });
    } catch {
      // Short-term conversation memory is best-effort and must never break
      // receipt persistence or returning the user's reply.
    }
  }
}

function formatUserTurnText(
  text: string,
  attachments: readonly MessageAttachment[]
): string {
  const attachmentNames = attachments
    .map((attachment) => attachment.fileName?.trim() ?? "")
    .filter(Boolean);
  const parts: string[] = [];

  if (attachmentNames.length > 0) {
    parts.push(`[Вложения: ${attachmentNames.join(", ")}]`);
  }
  if (text.trim()) {
    parts.push(text.trim());
  }

  return sanitizeConversationTurnText(parts.join(" "));
}

export function sanitizeConversationTurnText(text: string): string {
  const redacted = redactSensitive(text).trim();

  if (redacted.length <= MAX_CONVERSATION_TURN_CHARS) {
    return redacted;
  }

  return `${redacted.slice(0, MAX_CONVERSATION_TURN_CHARS - 1)}…`;
}
