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
    expect(planning.seenQuery).toEqual({
      text: "family tasks",
      scope: "family"
    });
  });

  it("forwards an explicit personal planning scope", async () => {
    const planning = new RecordingPlanningProvider([]);
    const useCase = new QueryPlanningStateUseCase({ planning });

    await useCase.execute({
      query: "my tasks",
      scope: "personal"
    });

    expect(planning.seenQuery).toEqual({
      text: "my tasks",
      scope: "personal"
    });
  });

  it("adds a today date range for today queries", async () => {
    const planning = new RecordingPlanningProvider([]);
    const useCase = new QueryPlanningStateUseCase({ planning });

    await useCase.execute({
      query: "что на сегодня",
      now: new Date("2026-07-23T10:15:00.000Z")
    });

    expect(planning.seenQuery).toEqual({
      text: "что на сегодня",
      scope: "family",
      startDateFrom: "2026-07-23",
      startDateTo: "2026-07-23"
    });
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
