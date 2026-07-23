import type {
  PlanningPort,
  PlanningScope
} from "../../../ports/planning-port.js";

export interface QueryPlanningStateInput {
  readonly query: string;
  readonly scope?: PlanningScope;
  readonly now?: Date;
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
    const interpretedQuery = interpretPlanningQuery(
      input.query,
      input.now ?? new Date()
    );
    const result = await this.dependencies.planning.queryPlanningState({
      text: interpretedQuery.text,
      scope: input.scope ?? "family",
      ...interpretedQuery.dateRange
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

function interpretPlanningQuery(
  query: string,
  now: Date
): {
  readonly text: string;
  readonly dateRange: {
    readonly startDateFrom?: string;
    readonly startDateTo?: string;
  };
} {
  if (!/\b(today|today's)\b|сегодня/iu.test(query)) {
    return {
      text: query,
      dateRange: {}
    };
  }

  const day = now.toISOString().slice(0, 10);
  const text = query
    .replace(/\b(today|today's)\b/giu, " ")
    .replace(/сегодня/giu, " ")
    .replace(/\b(what|what's|on|for)\b/giu, " ")
    .replace(/(^|\s)(что|на|за|по)(?=\s|$)/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    text,
    dateRange: {
      startDateFrom: day,
      startDateTo: day
    }
  };
}
