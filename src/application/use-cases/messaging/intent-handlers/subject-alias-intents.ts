import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type { SubjectAliasManager } from "../dispatch-accepted-command.js";
import { toSubjectAliasAction } from "../dispatch-command-helpers.js";

export interface ManageSubjectAliasesDependencies {
  readonly manager?: SubjectAliasManager | undefined;
}

export async function handleManageSubjectAliases(
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
  >,
  dependencies: ManageSubjectAliasesDependencies
): Promise<OutboundReply> {
  if (!dependencies.manager) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.manager.execute(toSubjectAliasAction(intent));

  return {
    chatId: context.chat.id,
    text: result.text
  };
}
