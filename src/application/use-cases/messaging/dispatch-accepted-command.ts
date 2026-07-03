import type { FileInboxRecord } from "../../../core/domain/file-inbox/file-inbox-record.js";
import type { OutboundReply } from "../../../core/domain/messaging/reply.js";
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
  ): Promise<readonly FileInboxRecord[]>;
}

export interface DispatchAcceptedCommandInput {
  readonly route: CommandRoute;
  readonly context: AcceptedMessageContext;
}

export interface DispatchAcceptedCommandDependencies {
  readonly systemHealthHandler: SystemHealthCommandHandler;
  readonly attachmentStore?: MessageAttachmentStore;
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

    if (
      input.route.kind === "family_message" &&
      input.context.attachments.length > 0 &&
      this.dependencies.attachmentStore
    ) {
      return this.storeFamilyMessageAttachments(input.context);
    }

    return Promise.resolve({
      chatId: input.context.chat.id,
      text: `Command not implemented yet: ${input.route.kind}.`
    });
  }

  private async storeFamilyMessageAttachments(
    context: AcceptedMessageContext
  ): Promise<OutboundReply> {
    const records = await this.dependencies.attachmentStore?.execute({
      provider: context.provider,
      receivedAt: context.receivedAt,
      attachments: context.attachments
    });

    if (!records || records.length === 0) {
      return {
        chatId: context.chat.id,
        text: "No downloadable attachments found."
      };
    }

    return {
      chatId: context.chat.id,
      text: `Saved ${records.length} attachment(s).`
    };
  }
}
