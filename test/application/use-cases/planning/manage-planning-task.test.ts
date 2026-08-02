import { describe, expect, it } from "vitest";

import { ManagePlanningTaskUseCase } from "../../../../src/application/use-cases/planning/manage-planning-task.js";
import type {
  PlanningItem,
  PlanningPort,
  PlanningQuery,
  PlanningTaskComplete,
  PlanningTaskCreate,
  PlanningTaskUpdate
} from "../../../../src/ports/planning-port.js";

describe("ManagePlanningTaskUseCase", () => {
  it("creates family planning tasks with checklist items", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "T-created",
        title: "Pack bags",
        status: "open"
      }
    ]);
    const useCase = new ManagePlanningTaskUseCase({ planning });

    await expect(
      useCase.execute({
        action: "create",
        title: "Pack bags",
        date: "2026-07-24",
        checklistItems: ["passports", "tickets"]
      })
    ).resolves.toEqual({
      status: "created",
      item: {
        id: "T-created",
        title: "Pack bags",
        status: "open"
      },
      text: [
        "Created family planning task:",
        "Pack bags",
        "External id: T-created",
        "Date: 2026-07-24",
        "Checklist items: 2"
      ].join("\n")
    });
    expect(planning.created).toEqual({
      title: "Pack bags",
      scope: "family",
      date: "2026-07-24",
      checklistItems: ["passports", "tickets"]
    });
  });

  it("emits family notifications when family planning tasks are created", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "T-created",
        title: "Pack bags",
        status: "open"
      }
    ]);
    const notifications = new RecordingNotificationCreator();
    const useCase = new ManagePlanningTaskUseCase({
      planning,
      notifications
    });

    await useCase.execute({
      action: "create",
      title: "Pack bags",
      date: "2026-07-24",
      checklistItems: ["passports"],
      actorId: "actor-owner"
    });

    expect(notifications.created).toEqual({
      scope: "family",
      title: "Planning task created",
      body: [
        "Created family planning task:",
        "Pack bags",
        "External id: T-created",
        "Date: 2026-07-24",
        "Checklist items: 1"
      ].join("\n"),
      sourceKind: "planning_task",
      sourceId: "T-created",
      createdByActorId: "actor-owner"
    });
  });

  it("completes a single matching planning task", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "T-1",
        title: "Pack bags",
        status: "open"
      }
    ]);
    const useCase = new ManagePlanningTaskUseCase({ planning });

    await expect(
      useCase.execute({
        action: "complete",
        query: "pack bags",
        now: new Date("2026-07-23T10:00:00.000Z")
      })
    ).resolves.toEqual({
      status: "completed",
      item: {
        id: "T-1",
        title: "Pack bags",
        status: "open"
      },
      text: "Completed family task: Pack bags (T-1)"
    });
    expect(planning.seenQuery).toEqual({
      text: "pack bags",
      scope: "family"
    });
    expect(planning.completed).toEqual({
      taskId: "T-1",
      scope: "family",
      completedAt: new Date("2026-07-23T10:00:00.000Z")
    });
  });

  it("updates a planning task title by id", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "T-1",
        title: "Pack beach bags",
        status: "open"
      }
    ]);
    const useCase = new ManagePlanningTaskUseCase({ planning });

    await expect(
      useCase.execute({
        action: "update",
        taskId: "T-1",
        title: "Pack beach bags"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        id: "T-1",
        title: "Pack beach bags",
        status: "open"
      },
      text: "Updated family task: Pack beach bags (T-1)"
    });
    expect(planning.updated).toEqual({
      taskId: "T-1",
      title: "Pack beach bags",
      scope: "family"
    });
  });

  it("refuses ambiguous task completion", async () => {
    const planning = new RecordingPlanningProvider([
      {
        id: "T-1",
        title: "Pack bags",
        status: "open"
      },
      {
        id: "T-2",
        title: "Pack lunch",
        status: "open"
      }
    ]);
    const useCase = new ManagePlanningTaskUseCase({ planning });

    await expect(
      useCase.execute({ action: "complete", query: "pack" })
    ).resolves.toEqual({
      status: "ambiguous",
      items: [
        {
          id: "T-1",
          title: "Pack bags",
          status: "open"
        },
        {
          id: "T-2",
          title: "Pack lunch",
          status: "open"
        }
      ],
      text: [
        "More than one planning item matched. Please be more specific:",
        "- Pack bags (T-1)",
        "- Pack lunch (T-2)"
      ].join("\n")
    });
    expect(planning.completed).toBeUndefined();
  });
});

class RecordingPlanningProvider implements PlanningPort {
  seenQuery: PlanningQuery | undefined;
  created: PlanningTaskCreate | undefined;
  updated: PlanningTaskUpdate | undefined;
  completed: PlanningTaskComplete | undefined;

  constructor(private readonly items: readonly PlanningItem[]) {}

  async queryPlanningState(query: PlanningQuery) {
    this.seenQuery = query;

    return {
      items: this.items
    };
  }

  async createPlanningTask(input: PlanningTaskCreate) {
    this.created = input;

    return {
      item: this.items[0]!
    };
  }

  async completePlanningTask(input: PlanningTaskComplete) {
    this.completed = input;

    return {
      item: this.items[0]!
    };
  }

  async updatePlanningTask(input: PlanningTaskUpdate) {
    this.updated = input;

    return {
      item: this.items[0]!
    };
  }
}

class RecordingNotificationCreator {
  created:
    | {
        readonly scope: "family" | "personal";
        readonly title: string;
        readonly body: string;
        readonly sourceKind?: string;
        readonly sourceId?: string;
        readonly createdByActorId?: string;
        readonly recipientActorId?: string;
      }
    | undefined;

  async execute(input: NonNullable<RecordingNotificationCreator["created"]>) {
    this.created = input;

    return {
      notification: {
        id: "notification-1",
        ...input,
        createdAt: new Date("2026-07-24T00:00:00.000Z")
      },
      recipientActorIds: ["actor-owner"]
    };
  }
}
