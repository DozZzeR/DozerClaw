import { describe, expect, it } from "vitest";

import { SingularityPlanningProvider } from "../../../src/infrastructure/providers/singularity/singularity-planning-provider.js";

describe("SingularityPlanningProvider", () => {
  it("lists active Singularity tasks as planning items", async () => {
    const fetcher = new RecordingFetch({
      tasks: [
        task({ id: "T-1", title: "Renew Max passport" }),
        task({ id: "T-2", title: "Book dentist", start: "2026-07-24" })
      ]
    });
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      maxResults: 25,
      familyProjectId: "P-family",
      fetch: fetcher.fetch
    });

    await expect(
      provider.queryPlanningState({ text: "", scope: "family" })
    ).resolves.toEqual({
      items: [
        {
          id: "T-1",
          title: "Renew Max passport",
          status: "open"
        },
        {
          id: "T-2",
          title: "Book dentist",
          status: "scheduled"
        }
      ]
    });
    expect(fetcher.requests).toEqual([
      expect.objectContaining({
        url: "https://api.singularity-app.com/v2/task?maxCount=25&includeRemoved=false&includeArchived=false&includeAllRecurrenceInstances=false&projectId=P-family",
        authorization: "Bearer singularity-token",
        method: "GET"
      })
    ]);
  });

  it("does not apply the family project filter to personal queries", async () => {
    const fetcher = new RecordingFetch({ tasks: [] });
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      familyProjectId: "P-family",
      fetch: fetcher.fetch
    });

    await provider.queryPlanningState({ text: "", scope: "personal" });

    expect(fetcher.requests[0]?.url).toBe(
      "https://api.singularity-app.com/v2/task?maxCount=25&includeRemoved=false&includeArchived=false&includeAllRecurrenceInstances=false"
    );
  });

  it("passes today date range query parameters", async () => {
    const fetcher = new RecordingFetch({ tasks: [] });
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      familyProjectId: "P-family",
      fetch: fetcher.fetch
    });

    await provider.queryPlanningState({
      text: "today",
      scope: "family",
      startDateFrom: "2026-07-23",
      startDateTo: "2026-07-23"
    });

    expect(fetcher.requests[0]?.url).toBe(
      "https://api.singularity-app.com/v2/task?maxCount=25&includeRemoved=false&includeArchived=false&includeAllRecurrenceInstances=false&startDateFrom=2026-07-23&startDateTo=2026-07-23&projectId=P-family"
    );
  });

  it("creates family tasks and checklist items", async () => {
    const fetcher = new RecordingFetchSequence([
      task({ id: "T-created", title: "Pack bags" }),
      { id: "C-1", parent: "T-created", title: "passports", done: false },
      { id: "C-2", parent: "T-created", title: "tickets", done: false }
    ]);
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      familyProjectId: "P-family",
      fetch: fetcher.fetch
    });

    await expect(
      provider.createPlanningTask({
        title: "Pack bags",
        scope: "family",
        date: "2026-07-24",
        checklistItems: ["passports", "tickets"]
      })
    ).resolves.toEqual({
      item: {
        id: "T-created",
        title: "Pack bags",
        status: "open"
      }
    });
    expect(fetcher.requests).toEqual([
      expect.objectContaining({
        url: "https://api.singularity-app.com/v2/task",
        method: "POST",
        body: {
          title: "Pack bags",
          projectId: "P-family",
          start: "2026-07-24"
        }
      }),
      expect.objectContaining({
        url: "https://api.singularity-app.com/v2/checklist-item",
        method: "POST",
        body: {
          parent: "T-created",
          title: "passports",
          done: false,
          parentOrder: 1
        }
      }),
      expect.objectContaining({
        url: "https://api.singularity-app.com/v2/checklist-item",
        method: "POST",
        body: {
          parent: "T-created",
          title: "tickets",
          done: false,
          parentOrder: 2
        }
      })
    ]);
  });

  it("completes tasks", async () => {
    const fetcher = new RecordingFetch(task({ id: "T-1", title: "Pack bags" }));
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      fetch: fetcher.fetch
    });

    await expect(
      provider.completePlanningTask({
        taskId: "T-1",
        scope: "family",
        completedAt: new Date("2026-07-23T10:00:00.000Z")
      })
    ).resolves.toEqual({
      item: {
        id: "T-1",
        title: "Pack bags",
        status: "open"
      }
    });
    expect(fetcher.requests[0]).toEqual(
      expect.objectContaining({
        url: "https://api.singularity-app.com/v2/task/T-1",
        method: "PATCH",
        body: {
          complete: 1,
          checked: 1,
          completeLast: "2026-07-23T10:00:00.000Z"
        }
      })
    );
  });

  it("filters inactive, note-only, and locally non-matching tasks", async () => {
    const fetcher = new RecordingFetch({
      tasks: [
        task({ id: "T-1", title: "Renew Max passport", tags: ["family"] }),
        task({ id: "T-2", title: "Office task" }),
        task({ id: "T-3", title: "Removed", removed: true }),
        task({ id: "T-4", title: "Archived", journalDate: "2026-07-01" }),
        task({ id: "T-5", title: "Deleted", deleteDate: "2026-07-01" }),
        task({ id: "T-6", title: "Note", isNote: true }),
        task({ id: "T-7", title: "Completed", complete: 1 }),
        task({ id: "T-8", title: "Checked", checked: 1 })
      ]
    });
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      maxResults: 10,
      fetch: fetcher.fetch
    });

    await expect(
      provider.queryPlanningState({ text: "max family", scope: "family" })
    ).resolves.toEqual({
      items: [
        {
          id: "T-1",
          title: "Renew Max passport",
          status: "open"
        }
      ]
    });
  });

  it("reports failed task list responses", async () => {
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      fetch: async () =>
        new Response(JSON.stringify({ message: "unauthorized" }), {
          status: 401
        })
    });

    await expect(
      provider.queryPlanningState({ text: "tasks", scope: "family" })
    ).rejects.toThrow("Singularity task list request failed: HTTP 401");
  });

  it("rejects malformed task list responses", async () => {
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      fetch: async () => new Response(JSON.stringify({ items: [] }))
    });

    await expect(
      provider.queryPlanningState({ text: "tasks", scope: "family" })
    ).rejects.toThrow("Singularity task list response was incomplete");
  });

  it("passes AbortSignal and reports request timeouts", async () => {
    const fetcher = new RecordingFetch({ tasks: [] }, true);
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      requestTimeoutMs: 1,
      fetch: fetcher.fetch
    });

    await expect(
      provider.queryPlanningState({ text: "tasks", scope: "family" })
    ).rejects.toThrow("Singularity request timed out after 1ms");
    expect(fetcher.requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

function task(overrides: Record<string, unknown>) {
  return {
    id: "T-default",
    title: "Task",
    note: "",
    complete: 0,
    checked: 0,
    removed: false,
    journalDate: "",
    deleteDate: "",
    isNote: false,
    tags: [],
    ...overrides
  };
}

class RecordingFetch {
  readonly requests: Array<{
    readonly url: string;
    readonly method: string;
    readonly authorization: string;
    readonly signal: AbortSignal | undefined;
    readonly body: unknown;
  }> = [];

  constructor(
    private readonly responseBody: unknown,
    private readonly hangUntilAbort = false
  ) {}

  fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    this.requests.push({
      url: input.toString(),
      method: init?.method ?? "GET",
      authorization: String(new Headers(init?.headers).get("authorization")),
      signal: init?.signal ?? undefined,
      body: parseBody(init?.body)
    });

    if (this.hangUntilAbort) {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      });
    }

    return new Response(JSON.stringify(this.responseBody));
  };
}

class RecordingFetchSequence {
  readonly requests: RecordingFetch["requests"] = [];
  private readonly responseQueue: unknown[];

  constructor(responseBodies: readonly unknown[]) {
    this.responseQueue = [...responseBodies];
  }

  fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    this.requests.push({
      url: input.toString(),
      method: init?.method ?? "GET",
      authorization: String(new Headers(init?.headers).get("authorization")),
      signal: init?.signal ?? undefined,
      body: parseBody(init?.body)
    });

    return new Response(JSON.stringify(this.responseQueue.shift()));
  };
}

function parseBody(body: unknown): unknown {
  return typeof body === "string" ? JSON.parse(body) : undefined;
}
