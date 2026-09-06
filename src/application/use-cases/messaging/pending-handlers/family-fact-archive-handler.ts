import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { PendingFamilyFactArchiveDecision } from "../../../../ports/state-repository-port.js";
import type {
  ArchiveFamilyFactInput,
  ArchiveFamilyFactResult
} from "../../family-memory/archive-family-fact.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import {
  parseFamilyFactArchiveDecision,
  pendingActorDeniedReply
} from "../dispatch-command-helpers.js";

interface FamilyFactArchiverLike {
  execute(input: ArchiveFamilyFactInput): Promise<ArchiveFamilyFactResult>;
}

export interface PendingFamilyFactArchiveHandlerDependencies {
  readonly archiver?: FamilyFactArchiverLike | undefined;
  readonly clearPending: (chatId: string) => Promise<void> | undefined;
}

/**
 * Feature-owned handler for the family-fact archive pending decision. Extracted
 * from the dispatcher (DC-ARCH-001 stage C): the dispatcher selects it via the
 * pending registry and injects only the collaborators it needs.
 */
export async function handlePendingFamilyFactArchiveDecision(
  context: AcceptedMessageContext,
  pending: PendingFamilyFactArchiveDecision,
  dependencies: PendingFamilyFactArchiveHandlerDependencies
): Promise<OutboundReply> {
  const deniedReply = pendingActorDeniedReply(context, pending);
  if (deniedReply) {
    return deniedReply;
  }

  const decision = parseFamilyFactArchiveDecision(context.text);

  if (decision === undefined) {
    return {
      chatId: context.chat.id,
      text: [
        "Я жду выбор семейного факта для архивации.",
        'Можно написать номер факта или "отмена".'
      ].join("\n")
    };
  }

  if (decision === "cancel") {
    await dependencies.clearPending(context.chat.id);

    return {
      chatId: context.chat.id,
      text: "Ок, не архивирую семейный факт."
    };
  }

  if (!dependencies.archiver) {
    return {
      chatId: context.chat.id,
      text: "Memory archive resolver is not configured."
    };
  }

  const candidate = pending.candidates[decision];

  if (!candidate) {
    return {
      chatId: context.chat.id,
      text: "I could not find that archive candidate anymore."
    };
  }

  const result = await dependencies.archiver.execute({
    query: candidate.body,
    factId: candidate.id
  });
  await dependencies.clearPending(context.chat.id);

  if (result.status === "archived") {
    return {
      chatId: context.chat.id,
      text: `Archived family fact: ${result.fact.body}`
    };
  }

  return {
    chatId: context.chat.id,
    text: "I could not find an active family fact matching that request."
  };
}
