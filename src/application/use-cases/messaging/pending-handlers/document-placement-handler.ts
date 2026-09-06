import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingDocumentPlacementDecision } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { PendingChoiceClassifier } from "../classify-pending-choice.js";
import type { DocumentPlacementMover } from "../dispatch-accepted-command.js";
import { resolvePendingDecision } from "../resolve-pending-decision.js";
import type {
  PendingRoutingEventAttributes,
  PlacementDecision
} from "../dispatch-command-helpers.js";
import {
  buildPendingDocumentPlacementInterruptionClassifierText,
  documentPlacementDecisionPolicy,
  parsePlacementDecision,
  pendingActorDeniedReply,
  placementDecisionOptions,
  placementDecisionPrompt
} from "../dispatch-command-helpers.js";

export interface PendingDocumentPlacementHandlerDependencies {
  readonly classifier?: PendingChoiceClassifier<PlacementDecision> | undefined;
  readonly mover?: DocumentPlacementMover | undefined;
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
 * Feature-owned handler for the "move this document to its canonical folder?"
 * pending decision (accept / skip). Uses the deterministic -> model-choice
 * ladder and the injected interruption escalation and document mover. Stage C
 * of DC-ARCH-001.
 */
export async function handlePendingDocumentPlacementDecision(
  context: AcceptedMessageContext,
  pending: PendingDocumentPlacementDecision,
  dependencies: PendingDocumentPlacementHandlerDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  const decision = await resolvePendingDecision<PlacementDecision>({
    policy: documentPlacementDecisionPolicy,
    prompt: placementDecisionPrompt(pending),
    userReply: context.text,
    options: placementDecisionOptions,
    parseDeterministicChoice: parsePlacementDecision,
    classifier: dependencies.classifier
  });

  if (!decision) {
    const interrupted = await dependencies.runInterruption(
      context,
      buildPendingDocumentPlacementInterruptionClassifierText(
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
      text: placementDecisionPrompt(pending)
    };
  }

  if (decision === "skip") {
    await dependencies.clearPending(context.chat.id);
    await dependencies.recordRoutingEvent({
      pendingKind: "document_placement",
      policy: documentPlacementDecisionPolicy,
      choiceResult: decision,
      pendingCleared: true
    });

    return {
      chatId: context.chat.id,
      text: `Ок, оставляю ${pending.document.name} на текущем месте.`
    };
  }

  if (!pending.targetFolderId || !dependencies.mover) {
    await dependencies.clearPending(context.chat.id);
    await dependencies.recordRoutingEvent({
      pendingKind: "document_placement",
      policy: documentPlacementDecisionPolicy,
      choiceResult: decision,
      pendingCleared: true
    });

    return {
      chatId: context.chat.id,
      text: [
        `Не двигаю ${pending.document.name}: для папки ${pending.targetFolderPath} пока не настроен Drive folder id.`,
        "Файл остался на текущем месте."
      ].join("\n")
    };
  }

  await dependencies.mover.execute({
    externalId: pending.document.externalId,
    targetFolderId: pending.targetFolderId
  });
  await dependencies.clearPending(context.chat.id);
  await dependencies.recordRoutingEvent({
    pendingKind: "document_placement",
    policy: documentPlacementDecisionPolicy,
    choiceResult: decision,
    pendingCleared: true
  });

  return {
    chatId: context.chat.id,
    text: `Готово: переместил ${pending.document.name} в ${pending.targetFolderPath}.`
  };
}
