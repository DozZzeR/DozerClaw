import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  FamilyJournalRecall,
  FamilyJournalRecorder
} from "../dispatch-accepted-command.js";

type SaveLastOperation = (
  context: AcceptedMessageContext,
  input: Pick<
    LastOperationContext,
    "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
  >
) => Promise<void>;

export interface RecordFamilyJournalEntryDependencies {
  readonly recorder?: FamilyJournalRecorder | undefined;
  readonly saveLastOperation: SaveLastOperation;
}

export async function handleRecordFamilyJournalEntry(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "record_journal_entry" }>,
  dependencies: RecordFamilyJournalEntryDependencies
): Promise<OutboundReply> {
  if (!dependencies.recorder) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.recorder.execute({
    body: intent.summary,
    ...(intent.journalCategory ? { category: intent.journalCategory } : {}),
    ...(intent.subjectId ? { subjectId: intent.subjectId } : {}),
    sourceActorId: context.actor.id,
    sourceChatId: context.chat.id,
    sourceMessageText: context.text
  });
  await dependencies.saveLastOperation(context, {
    operationKind: "family_journal_entry_recorded",
    entityKind: "family_journal_entry",
    entityId: result.entry.id,
    entityLabel: result.entry.body
  });

  return {
    chatId: context.chat.id,
    text: `Saved family journal entry: ${result.entry.body}`
  };
}

export interface RecallFamilyJournalEntriesDependencies {
  readonly recall?: FamilyJournalRecall | undefined;
}

export async function handleRecallFamilyJournalEntries(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "recall_journal_entries" }>,
  dependencies: RecallFamilyJournalEntriesDependencies
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
