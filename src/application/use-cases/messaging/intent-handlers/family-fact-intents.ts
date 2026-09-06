import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  FamilyFactArchiver,
  FamilyFactRecall,
  FamilyFactRecorder,
  PendingFamilyFactArchiveDecisionStore,
  PendingFamilyFactDecisionStore
} from "../dispatch-accepted-command.js";
import { formatFamilyFactConfirmation } from "../dispatch-command-helpers.js";

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

type SaveLastOperation = (
  context: AcceptedMessageContext,
  input: Pick<
    LastOperationContext,
    "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
  >
) => Promise<void>;

export interface RecordFamilyFactDependencies {
  readonly recorder?: FamilyFactRecorder | undefined;
  readonly pendingStore?: PendingFamilyFactDecisionStore | undefined;
  readonly saveLastOperation: SaveLastOperation;
  readonly now: () => Date;
}

export async function handleRecordFamilyFact(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "record_fact" }>,
  dependencies: RecordFamilyFactDependencies
): Promise<OutboundReply> {
  if (!dependencies.recorder) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.recorder.execute({
    summary: intent.summary,
    ...(intent.category ? { category: intent.category } : {}),
    ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
    sourceActorId: context.actor.id,
    sourceChatId: context.chat.id,
    sourceMessageText: context.text
  });

  if (result.status === "needs_confirmation") {
    const now = dependencies.now();
    await dependencies.pendingStore?.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      newFact: result.newFact,
      candidates: result.candidates,
      createdAt: now,
      expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
    });

    return {
      chatId: context.chat.id,
      text: formatFamilyFactConfirmation(result)
    };
  }

  await dependencies.saveLastOperation(context, {
    operationKind: "family_fact_recorded",
    entityKind: "family_fact",
    entityId: result.fact.id,
    entityLabel: result.fact.body
  });

  return {
    chatId: context.chat.id,
    text: `Saved family fact: ${result.fact.body}`
  };
}

export interface RecallFamilyFactsDependencies {
  readonly recall?: FamilyFactRecall | undefined;
}

export async function handleRecallFamilyFacts(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "answer_from_memory" }>,
  dependencies: RecallFamilyFactsDependencies
): Promise<OutboundReply> {
  if (!dependencies.recall) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.recall.execute({
    query: intent.query
  });

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

export interface ArchiveFamilyFactDependencies {
  readonly archiver?: FamilyFactArchiver | undefined;
  readonly pendingStore?: PendingFamilyFactArchiveDecisionStore | undefined;
  readonly now: () => Date;
}

export async function handleArchiveFamilyFact(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "archive_fact" }>,
  dependencies: ArchiveFamilyFactDependencies
): Promise<OutboundReply> {
  if (!dependencies.archiver) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.archiver.execute({
    query: intent.query
  });

  if (result.status === "archived") {
    return {
      chatId: context.chat.id,
      text: `Archived family fact: ${result.fact.body}`
    };
  }

  if (result.status === "ambiguous") {
    const now = dependencies.now();
    await dependencies.pendingStore?.save({
      chatId: context.chat.id,
      actorId: context.actor.id,
      candidates: result.candidates,
      createdAt: now,
      expiresAt: new Date(now.getTime() + THIRTY_MINUTES_MS)
    });

    return {
      chatId: context.chat.id,
      text: [
        "I found multiple active family facts that could match.",
        ...result.candidates.map((fact, index) => `${index + 1}. ${fact.body}`),
        "Reply with the number to archive, or cancel."
      ].join("\n")
    };
  }

  return {
    chatId: context.chat.id,
    text: "I could not find an active family fact matching that request."
  };
}
