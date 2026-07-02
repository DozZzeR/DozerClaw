import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type {
  DispatchAcceptedCommandInput
} from "./dispatch-accepted-command.js";
import type {
  ProcessInboundMessageInput,
  ProcessInboundMessageResult
} from "./process-inbound-message.js";
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
}

export class HandleNormalizedInboundMessageUseCase {
  constructor(
    private readonly dependencies: HandleNormalizedInboundMessageDependencies
  ) {}

  async execute(
    input: HandleNormalizedInboundMessageInput
  ): Promise<OutboundReply> {
    const route = routeCommand(input.text);
    const pipelineResult = await this.dependencies.pipeline.execute({
      ...input,
      text: route.normalizedText,
      action: route.action
    });

    if (pipelineResult.status !== "accepted") {
      return pipelineResult.reply;
    }

    return this.dependencies.dispatcher.execute({
      route,
      context: pipelineResult.context
    });
  }
}
