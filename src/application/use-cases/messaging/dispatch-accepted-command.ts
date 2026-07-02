import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
import type { HandleSystemHealthCommandInput } from "../health/handle-system-health-command.js";
import type { AcceptedMessageContext } from "./process-inbound-message.js";
import type { CommandRoute } from "./route-command.js";

export interface SystemHealthCommandHandler {
  execute(input: HandleSystemHealthCommandInput): Promise<OutboundReply>;
}

export interface DispatchAcceptedCommandInput {
  readonly route: CommandRoute;
  readonly context: AcceptedMessageContext;
}

export interface DispatchAcceptedCommandDependencies {
  readonly systemHealthHandler: SystemHealthCommandHandler;
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

    return Promise.resolve({
      chatId: input.context.chat.id,
      text: `Command not implemented yet: ${input.route.kind}.`
    });
  }
}
