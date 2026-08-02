import type {
  PlanningPort,
  PlanningScope
} from "../../../ports/planning-port.js";
import { planningCalendarDate } from "./planning-calendar-date.js";

export interface QueryPlanningStateInput {
  readonly query: string;
  readonly scope?: PlanningScope;
  readonly now?: Date;
}

export type QueryPlanningStateResult =
  | {
      readonly status: "available";
      readonly text: string;
    }
  | {
      readonly status: "unavailable";
      readonly text: string;
    };

export class QueryPlanningStateUseCase {
  constructor(
    private readonly dependencies: {
      readonly planning: PlanningPort;
      readonly timeZone?: string;
    }
  ) {}

  async execute(
    input: QueryPlanningStateInput
  ): Promise<QueryPlanningStateResult> {
    const interpretedQuery = interpretPlanningQuery(
      input.query,
      input.now ?? new Date(),
      this.dependencies.timeZone ?? "UTC"
    );
    let result;

    try {
      result = await this.dependencies.planning.queryPlanningState({
        text: interpretedQuery.text,
        scope: input.scope ?? "family",
        ...interpretedQuery.dateRange
      });
    } catch {
      return {
        status: "unavailable",
        text: "Planning is temporarily unavailable. Please try again later."
      };
    }

    if (result.items.length === 0) {
      return {
        status: "available",
        text: "No planning items found."
      };
    }

    return {
      status: "available",
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
  now: Date,
  timeZone: string
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

  const day = planningCalendarDate(now, timeZone);
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
