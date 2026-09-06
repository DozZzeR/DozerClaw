import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingFileDestinationDecision } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type {
  FileUploadDestination,
  PendingRoutingEventAttributes
} from "../dispatch-command-helpers.js";
import {
  buildPendingFileDestinationInterruptionClassifierText,
  fileDestinationDecisionPolicy,
  fileDestinationPrompt,
  parseFileUploadDestination,
  pendingActorDeniedReply
} from "../dispatch-command-helpers.js";

export interface PendingFileDestinationHandlerDependencies {
  readonly storeAttachments: (
    context: AcceptedMessageContext,
    destination: FileUploadDestination
  ) => Promise<OutboundReply>;
  readonly runInterruption: (
    context: AcceptedMessageContext,
    classifierText: string,
    clearPending: () => Promise<void> | undefined
  ) => Promise<OutboundReply | undefined>;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
  readonly recordRoutingEvent: (
    attributes: PendingRoutingEventAttributes
  ) => Promise<void>;
}

/**
 * Feature-owned handler for the "where should I save this file?" pending
 * decision (local inbox vs Google Drive). Depends on the shared attachment
 * storage service and the interruption escalation via injected callbacks.
 * Stage C of DC-ARCH-001.
 */
export async function handlePendingFileDestinationDecision(
  context: AcceptedMessageContext,
  pending: PendingFileDestinationDecision,
  dependencies: PendingFileDestinationHandlerDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  const destination = parseFileUploadDestination(context.text);

  if (!destination) {
    const interrupted = await dependencies.runInterruption(
      context,
      buildPendingFileDestinationInterruptionClassifierText(
        pending,
        context.text
      ),
      () => dependencies.clearPending(context.chat.id)
    );

    if (interrupted) {
      return interrupted;
    }

    return {
      chatId: context.chat.id,
      text: fileDestinationPrompt(pending.attachments)
    };
  }

  const reply = await dependencies.storeAttachments(
    {
      ...context,
      provider: pending.provider,
      receivedAt: pending.receivedAt,
      attachments: pending.attachments
    },
    destination
  );

  await dependencies.clearPending(context.chat.id);
  await dependencies.recordRoutingEvent({
    pendingKind: "file_destination",
    policy: fileDestinationDecisionPolicy,
    choiceResult: destination,
    pendingCleared: true
  });

  return reply;
}
