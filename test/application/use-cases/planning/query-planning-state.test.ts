import { describe, expect, it } from "vitest";

import { QueryPlanningStateUseCase } from "../../../../src/application/use-cases/planning/query-planning-state.js";
import type {
  PlanningPort,
  PlanningQuery
} from "../../../../src/ports/planning-port.js";

describe("QueryPlanningStateUseCase", () => {
  it("formats planning items from the provider", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "task-1",
        title: "Renew Max passport",
        status: "open"
      },
      {
        id: "task-2",
        title: "Book dentist",
        status: "blocked"
      }
    ]);
    const useCase = new QueryPlanningStateUseCase({ planning });

    await expect(
      useCase.execute({ query: "family tasks" })
    ).resolves.toEqual({
      text: [
        "Planning items:",
        "- [open] Renew Max passport (task-1)",
        "- [blocked] Book dentist (task-2)"
      ].join("\n")
    });
    expect(planning.seenQuery).toEqual({ text: "family tasks" });
  });

  it("returns a clear empty state", async () => {
    const useCase = new QueryPlanningStateUseCase({
      planning: new RecordingPlanningProvider([])
    });

    await expect(useCase.execute({ query: "done" })).resolves.toEqual({
      text: "No planning items found."
    });
  });
});

class RecordingPlanningProvider implements PlanningPort {
  seenQuery: PlanningQuery | undefined;

  constructor(
    private readonly items: Awaited<
      ReturnType<PlanningPort["queryPlanningState"]>
    >["items"]
  ) {}

  async queryPlanningState(query: PlanningQuery) {
    this.seenQuery = query;

    return {
      items: this.items
    };
  }
}
