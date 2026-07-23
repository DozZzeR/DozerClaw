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
      fetch: fetcher.fetch
    });

    await expect(
      provider.queryPlanningState({ text: "" })
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
        url: "https://api.singularity-app.com/v2/task?maxCount=25&includeRemoved=false&includeArchived=false&includeAllRecurrenceInstances=false",
        authorization: "Bearer singularity-token",
        method: "GET"
      })
    ]);
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
      provider.queryPlanningState({ text: "max family" })
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
      provider.queryPlanningState({ text: "tasks" })
    ).rejects.toThrow("Singularity task list request failed: HTTP 401");
  });

  it("rejects malformed task list responses", async () => {
    const provider = new SingularityPlanningProvider({
      token: "singularity-token",
      apiBaseUrl: "https://api.singularity-app.com",
      fetch: async () => new Response(JSON.stringify({ items: [] }))
    });

    await expect(
      provider.queryPlanningState({ text: "tasks" })
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
      provider.queryPlanningState({ text: "tasks" })
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
      signal: init?.signal ?? undefined
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
