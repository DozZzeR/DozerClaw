import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  FamilyFactUpdater,
  FamilyJournalUpdater,
  PlanningTaskManager
} from "../dispatch-accepted-command.js";

type SaveLastOperation = (
  context: AcceptedMessageContext,
  input: Pick<
    LastOperationContext,
    "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
  >
) => Promise<void>;

export interface UpdateLastOperationDependencies {
  readonly familyFactUpdater?: FamilyFactUpdater | undefined;
  readonly familyJournalUpdater?: FamilyJournalUpdater | undefined;
  readonly planningTaskManager?: PlanningTaskManager | undefined;
  readonly saveLastOperation: SaveLastOperation;
}

type UpdateLastOperationIntent = Extract<
  InboundIntent,
  { readonly kind: "update_last_operation" }
>;

/**
 * Feature-owned handler for the update_last_operation intent: append checklist
 * items to the latest planning task, or update the latest family fact, journal
 * entry, or planning task. Stage C of DC-ARCH-001.
 */
export async function handleUpdateLastOperation(
  context: AcceptedMessageContext,
  intent: UpdateLastOperationIntent,
  lastOperation: LastOperationContext | undefined,
  dependencies: UpdateLastOperationDependencies
): Promise<OutboundReply> {
  if (intent.operationAction === "append_checklist") {
    return handleAddChecklistItems(context, intent, lastOperation, dependencies);
  }

  if (!lastOperation) {
    return {
      chatId: context.chat.id,
      text: "What should I update?"
    };
  }

  if (lastOperation.entityKind === "family_fact") {
    if (!intent.summary) {
      return {
        chatId: context.chat.id,
        text: "What should I update?"
      };
    }

    if (!dependencies.familyFactUpdater) {
      return {
        chatId: context.chat.id,
        text: "Family fact updates are not connected yet."
      };
    }

    const result = await dependencies.familyFactUpdater.execute({
      factId: lastOperation.entityId,
      body: intent.summary
    });

    if (result.status !== "updated") {
      return {
        chatId: context.chat.id,
        text: "I could not find the latest family fact to update."
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
      text: `Updated family fact: ${result.fact.body}`
    };
  }

  if (lastOperation.entityKind === "family_journal_entry") {
    if (!intent.summary) {
      return {
        chatId: context.chat.id,
        text: "What should I update?"
      };
    }

    if (!dependencies.familyJournalUpdater) {
      return {
        chatId: context.chat.id,
        text: "Family journal updates are not connected yet."
      };
    }

    const result = await dependencies.familyJournalUpdater.execute({
      entryId: lastOperation.entityId,
      body: intent.summary
    });

    if (result.status !== "updated") {
      return {
        chatId: context.chat.id,
        text: "I could not find the latest family journal entry to update."
      };
    }

    await dependencies.saveLastOperation(context, {
      operationKind: "family_journal_entry_recorded",
      entityKind: "family_journal_entry",
      entityId: result.entry.id,
      entityLabel: result.entry.body
    });

    return {
      chatId: context.chat.id,
      text: `Updated family journal entry: ${result.entry.body}`
    };
  }

  if (lastOperation.entityKind === "planning_task") {
    if (!intent.summary) {
      return {
        chatId: context.chat.id,
        text: "What should I update?"
      };
    }

    if (!dependencies.planningTaskManager) {
      return {
        chatId: context.chat.id,
        text: "Planning writes are not connected yet."
      };
    }

    const result = await dependencies.planningTaskManager.execute({
      action: "update",
      taskId: lastOperation.entityId,
      title: intent.summary
    });

    if (result.status === "updated") {
      await dependencies.saveLastOperation(context, {
        operationKind: "planning_task_created",
        entityKind: "planning_task",
        entityId: result.item.id,
        entityLabel: result.item.title
      });
    }

    return {
      chatId: context.chat.id,
      text: result.text
    };
  }

  return {
    chatId: context.chat.id,
    text: "I cannot update that latest operation yet."
  };
}

async function handleAddChecklistItems(
  context: AcceptedMessageContext,
  intent: UpdateLastOperationIntent,
  lastOperation: LastOperationContext | undefined,
  dependencies: UpdateLastOperationDependencies
): Promise<OutboundReply> {
  if (!lastOperation || lastOperation.entityKind !== "planning_task") {
    return {
      chatId: context.chat.id,
      text: "I can add checklist items only to the latest planning task."
    };
  }

  if (!intent.checklistItems?.length) {
    return {
      chatId: context.chat.id,
      text: "Which checklist items should I add?"
    };
  }

  if (!dependencies.planningTaskManager) {
    return {
      chatId: context.chat.id,
      text: "Planning writes are not connected yet."
    };
  }

  const result = await dependencies.planningTaskManager.execute({
    action: "add_checklist_items",
    taskId: lastOperation.entityId,
    ...(lastOperation.entityLabel
      ? { taskTitle: lastOperation.entityLabel }
      : {}),
    checklistItems: intent.checklistItems
  });

  if (result.status === "checklist_items_added") {
    await dependencies.saveLastOperation(context, {
      operationKind: "planning_task_created",
      entityKind: "planning_task",
      entityId: result.item.id,
      entityLabel: result.item.title
    });
  }

  return {
    chatId: context.chat.id,
    text: result.text
  };
}
