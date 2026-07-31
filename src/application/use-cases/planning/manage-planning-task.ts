import type {
  PlanningPort,
  PlanningScope
} from "../../../ports/planning-port.js";
import type {
  PlanningNotificationCreator
} from "../notifications/notification-use-cases.js";

export type ManagePlanningTaskInput =
  | {
      readonly action: "create";
      readonly title: string;
      readonly scope?: PlanningScope;
      readonly date?: string;
      readonly checklistItems?: readonly string[];
      readonly actorId?: string;
    }
  | {
      readonly action: "complete";
      readonly query: string;
      readonly scope?: PlanningScope;
      readonly now?: Date;
    };

export interface ManagePlanningTaskResult {
  readonly text: string;
}

export class ManagePlanningTaskUseCase {
  constructor(
    private readonly dependencies: {
      readonly planning: PlanningPort;
      readonly notifications?: PlanningNotificationCreator;
    }
  ) {}

  async execute(
    input: ManagePlanningTaskInput
  ): Promise<ManagePlanningTaskResult> {
    const scope = input.scope ?? "family";

    if (input.action === "create") {
      if (!this.dependencies.planning.createPlanningTask) {
        return {
          text: "Planning writes are not connected yet."
        };
      }

      const result = await this.dependencies.planning.createPlanningTask({
        title: input.title,
        scope,
        ...(input.date ? { date: input.date } : {}),
        ...(input.checklistItems ? { checklistItems: input.checklistItems } : {})
      });

      const text = planningTaskCreationNotification({
        scope,
        title: result.item.title,
        id: result.item.id,
        ...(input.date ? { date: input.date } : {}),
        ...(input.checklistItems
          ? { checklistItemCount: input.checklistItems.length }
          : {})
      });

      if (this.dependencies.notifications && scope === "family") {
        await this.dependencies.notifications.execute({
          scope,
          title: "Planning task created",
          body: text,
          sourceKind: "planning_task",
          sourceId: result.item.id,
          ...(input.actorId ? { createdByActorId: input.actorId } : {})
        });
      }

      if (this.dependencies.notifications && scope === "personal" && input.actorId) {
        await this.dependencies.notifications.execute({
          scope,
          recipientActorId: input.actorId,
          title: "Planning task created",
          body: text,
          sourceKind: "planning_task",
          sourceId: result.item.id,
          createdByActorId: input.actorId
        });
      }

      return {
        text
      };
    }

    if (!this.dependencies.planning.completePlanningTask) {
      return {
        text: "Planning writes are not connected yet."
      };
    }

    const matches = await this.dependencies.planning.queryPlanningState({
      text: input.query,
      scope
    });

    if (matches.items.length === 0) {
      return {
        text: "No matching planning item found to complete."
      };
    }

    if (matches.items.length > 1) {
      return {
        text: [
          "More than one planning item matched. Please be more specific:",
          ...matches.items.map((item) => `- ${item.title} (${item.id})`)
        ].join("\n")
      };
    }

    const item = matches.items[0]!;
    const result = await this.dependencies.planning.completePlanningTask({
      taskId: item.id,
      scope,
      completedAt: input.now ?? new Date()
    });

    return {
      text: `Completed ${scope} task: ${result.item.title} (${result.item.id})`
    };
  }
}

function planningTaskCreationNotification(input: {
  readonly scope: PlanningScope;
  readonly title: string;
  readonly id: string;
  readonly date?: string;
  readonly checklistItemCount?: number;
}): string {
  return [
    `Created ${input.scope} planning task:`,
    input.title,
    `External id: ${input.id}`,
    ...(input.date ? [`Date: ${input.date}`] : []),
    ...(input.checklistItemCount !== undefined
      ? [`Checklist items: ${input.checklistItemCount}`]
      : [])
  ].join("\n");
}
