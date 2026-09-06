import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingFamilyFactDecision } from "../../../../ports/state-repository-port.js";
import type {
  FamilyFactDecision,
  ResolveFamilyFactDecisionInput,
  ResolveFamilyFactDecisionResult
} from "../../family-memory/resolve-family-fact-decision.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { PendingChoiceClassifier } from "../classify-pending-choice.js";
import { resolvePendingDecision } from "../resolve-pending-decision.js";
import {
  familyFactDecisionOptions,
  familyFactDecisionPrompt,
  parseFamilyFactDecision,
  pendingActorDeniedReply
} from "../dispatch-command-helpers.js";

interface FamilyFactDecisionResolverLike {
  execute(
    input: ResolveFamilyFactDecisionInput
  ): Promise<ResolveFamilyFactDecisionResult>;
}

export interface PendingFamilyFactHandlerDependencies {
  readonly resolver?: FamilyFactDecisionResolverLike | undefined;
  readonly classifier?: PendingChoiceClassifier<FamilyFactDecision> | undefined;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
}

/**
 * Feature-owned handler for the family-fact create/update pending decision.
 * Uses the deterministic -> model-choice ladder (via resolvePendingDecision)
 * and injects only the resolver, choice classifier and pending store it needs.
 * Stage C of DC-ARCH-001.
 */
export async function handlePendingFamilyFactDecision(
  context: AcceptedMessageContext,
  pending: PendingFamilyFactDecision,
  dependencies: PendingFamilyFactHandlerDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  const deterministicDecision = parseFamilyFactDecision(context.text);
  const modelDecision = deterministicDecision
    ? undefined
    : await resolvePendingDecision<FamilyFactDecision>({
        policy: "choice_only",
        prompt: familyFactDecisionPrompt(pending),
        userReply: context.text,
        options: familyFactDecisionOptions,
        parseDeterministicChoice: (text) =>
          parseFamilyFactDecision(text)?.decision,
        classifier: dependencies.classifier
      });
  const parsedDecision =
    deterministicDecision ??
    (modelDecision ? { decision: modelDecision } : undefined);

  if (!parsedDecision) {
    return {
      chatId: context.chat.id,
      text: [
        "Я жду решение по семейному факту.",
        'Можно написать: "обнови существующий", "создай новый" или "отмена".'
      ].join("\n")
    };
  }

  if (!dependencies.resolver) {
    return {
      chatId: context.chat.id,
      text: "Memory decision resolver is not configured."
    };
  }

  const result = await dependencies.resolver.execute({
    decision: parsedDecision.decision,
    ...(parsedDecision.candidateIndex !== undefined
      ? { candidateIndex: parsedDecision.candidateIndex }
      : {}),
    pending
  });

  await dependencies.clearPending(context.chat.id);

  if (result.status === "cancelled") {
    return {
      chatId: context.chat.id,
      text: "Ок, не меняю семейную память."
    };
  }

  if (result.status === "updated") {
    return {
      chatId: context.chat.id,
      text: `Готово: обновил семейный факт: ${result.fact.body}`
    };
  }

  return {
    chatId: context.chat.id,
    text: `Готово: сохранил новый семейный факт: ${result.fact.body}`
  };
}
