import type { OutboundReply } from "../../../../core/domain/messaging/reply.js";
import type { LastOperationContext } from "../../../../ports/state-repository-port.js";
import type { AcceptedMessageContext } from "../process-inbound-message.js";
import type { InboundIntent } from "../classify-inbound-intent.js";
import type {
  PlanningStateQuery,
  PlanningTaskManager
} from "../dispatch-accepted-command.js";
import { planningDateFromIntent } from "../dispatch-command-helpers.js";

type SaveLastOperation = (
  context: AcceptedMessageContext,
  input: Pick<
    LastOperationContext,
    "operationKind" | "entityKind" | "entityId" | "entityLabel" | "document"
  >
) => Promise<void>;

export interface QueryPlanningStateDependencies {
  readonly planningQuery?: PlanningStateQuery | undefined;
}

export async function handleQueryPlanningState(
  context: AcceptedMessageContext,
  intent: Extract<InboundIntent, { readonly kind: "query_planning" }>,
  dependencies: QueryPlanningStateDependencies
): Promise<OutboundReply> {
  if (!dependencies.planningQuery) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result = await dependencies.planningQuery.execute({
    query: intent.query,
    now: context.receivedAt
  });

  return {
    chatId: context.chat.id,
    text: result.text
  };
}

export interface ManagePlanningTaskDependencies {
  readonly planningTaskManager?: PlanningTaskManager | undefined;
  readonly saveLastOperation: SaveLastOperation;
  readonly timeZone: string;
}

export async function handleManagePlanningTask(
  context: AcceptedMessageContext,
  intent: Extract<
    InboundIntent,
    { readonly kind: "create_reminder" | "manage_planning" }
  >,
  dependencies: ManagePlanningTaskDependencies
): Promise<OutboundReply> {
  if (!dependencies.planningTaskManager) {
    return {
      chatId: context.chat.id,
      text: `I understood this as ${intent.kind}, but that action is not connected yet.`
    };
  }

  const result =
    intent.kind === "create_reminder" || intent.action === "create"
      ? await dependencies.planningTaskManager.execute({
          action: "create",
          title:
            intent.kind === "create_reminder"
              ? intent.summary
              : intent.title ?? "",
          actorId: context.actor.id,
          ...planningDateFromIntent(context, intent, dependencies.timeZone),
          ...(intent.kind === "manage_planning" && intent.checklistItems
            ? { checklistItems: intent.checklistItems }
            : {})
        })
      : await dependencies.planningTaskManager.execute({
          action: "complete",
          query: intent.query ?? "",
          now: context.receivedAt
        });

  if (intent.kind === "create_reminder" || intent.action === "create") {
    const title =
      intent.kind === "create_reminder" ? intent.summary : intent.title ?? "";

    if (result.status === "created" && title) {
      await dependencies.saveLastOperation(context, {
        operationKind: "planning_task_created",
        entityKind: "planning_task",
        entityId: result.item.id,
        entityLabel: result.item.title
      });
    }
  }

  return {
    chatId: context.chat.id,
    text: result.text
  };
}
