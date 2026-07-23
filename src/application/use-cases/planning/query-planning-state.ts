import type { PlanningPort } from "../../../ports/planning-port.js";

export interface QueryPlanningStateInput {
  readonly query: string;
}

export interface QueryPlanningStateResult {
  readonly text: string;
}

export class QueryPlanningStateUseCase {
  constructor(
    private readonly dependencies: { readonly planning: PlanningPort }
  ) {}

  async execute(
    input: QueryPlanningStateInput
  ): Promise<QueryPlanningStateResult> {
    const result = await this.dependencies.planning.queryPlanningState({
      text: input.query
    });

    if (result.items.length === 0) {
      return {
        text: "No planning items found."
      };
    }

    return {
      text: [
        "Planning items:",
        ...result.items.map(
          (item) => `- [${item.status}] ${item.title} (${item.id})`
        )
      ].join("\n")
    };
  }
}
