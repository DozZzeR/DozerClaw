import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingFileDuplicateDecision } from "../../../../ports/state-repository-port.js";
import type {
  FileDuplicateMutationDecision,
  ResolveFileDuplicateDecisionResult
} from "../../file-inbox/resolve-file-duplicate-decision.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { PendingChoiceClassifier } from "../classify-pending-choice.js";
import { resolvePendingDecision } from "../resolve-pending-decision.js";
import type {
  DuplicateDecision,
  PendingRoutingEventAttributes
} from "../dispatch-command-helpers.js";
import {
  duplicateDecisionOptions,
  duplicateDecisionPrompt,
  parseDuplicateDecision,
  pendingActorDeniedReply
} from "../dispatch-command-helpers.js";

export interface PendingFileDuplicateHandlerDependencies {
  readonly classifier?: PendingChoiceClassifier<DuplicateDecision> | undefined;
  readonly resolveDuplicate: (
    decision: FileDuplicateMutationDecision,
    pending: PendingFileDuplicateDecision
  ) => Promise<ResolveFileDuplicateDecisionResult>;
  readonly recordRoutingEvent: (
    attributes: PendingRoutingEventAttributes
  ) => Promise<void>;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
}

/**
 * Feature-owned handler for the "file already exists" pending choice (copy /
 * overwrite / skip). The destination sub-branch (choosing local vs Drive) stays
 * with the shared attachment-storage machinery in the dispatcher. Stage C of
 * DC-ARCH-001.
 */
export async function handlePendingFileDuplicateDecision(
  context: AcceptedMessageContext,
  pending: PendingFileDuplicateDecision,
  dependencies: PendingFileDuplicateHandlerDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  const decision = await resolvePendingDecision<DuplicateDecision>({
    policy: "choice_only",
    prompt: duplicateDecisionPrompt(pending.fileName, pending.suggestedCopyName),
    userReply: context.text,
    options: duplicateDecisionOptions,
    parseDeterministicChoice: parseDuplicateDecision,
    classifier: dependencies.classifier
  });

  if (decision === undefined) {
    await dependencies.recordRoutingEvent({
      pendingKind: "file_duplicate",
      policy: "choice_only",
      choiceResult: "unclear",
      pendingCleared: false
    });

    return {
      chatId: context.chat.id,
      text: [
        `Я жду решение по файлу ${pending.fileName}.`,
        `Можно написать: "сохрани копию", "перезапиши" или "ничего не делай".`
      ].join("\n")
    };
  }

  if (decision === "skip") {
    await dependencies.clearPending(context.chat.id);
    await dependencies.recordRoutingEvent({
      pendingKind: "file_duplicate",
      policy: "choice_only",
      choiceResult: decision,
      pendingCleared: true
    });

    return {
      chatId: context.chat.id,
      text: `Ок, ничего не делаю с файлом ${pending.fileName}.`
    };
  }

  const result = await dependencies.resolveDuplicate(decision, pending);

  if (result.status === "copied") {
    await dependencies.clearPending(context.chat.id);
    await dependencies.recordRoutingEvent({
      pendingKind: "file_duplicate",
      policy: "choice_only",
      choiceResult: decision,
      pendingCleared: true
    });

    return {
      chatId: context.chat.id,
      text: `Готово: сохранил копию как ${pending.suggestedCopyName}.`
    };
  }

  if (result.status === "overwritten") {
    await dependencies.clearPending(context.chat.id);
    await dependencies.recordRoutingEvent({
      pendingKind: "file_duplicate",
      policy: "choice_only",
      choiceResult: decision,
      pendingCleared: true
    });

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
