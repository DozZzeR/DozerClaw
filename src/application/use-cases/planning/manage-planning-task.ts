import type {
  PlanningPort,
  PlanningScope
} from "../../../ports/planning-port.js";

export type ManagePlanningTaskInput =
  | {
      readonly action: "create";
      readonly title: string;
      readonly scope?: PlanningScope;
      readonly date?: string;
      readonly checklistItems?: readonly string[];
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
    private readonly dependencies: { readonly planning: PlanningPort }
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

      return {
        text: `Added to ${scope} tasks: ${result.item.title} (${result.item.id})`
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
