import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type {
  DispatchAcceptedCommandInput
} from "./dispatch-accepted-command.js";
import type {
  ProcessInboundMessageInput,
  ProcessInboundMessageResult
} from "./process-inbound-message.js";
import type { MessageReceiptRepositoryPort } from "../../../ports/message-receipt-repository-port.js";
import { routeCommand } from "./route-command.js";

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

    return reply;
  }
}
