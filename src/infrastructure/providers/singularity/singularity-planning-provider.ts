import type {
  PlanningItem,
  PlanningPort,
  PlanningQuery,
  PlanningQueryResult,
  PlanningTaskComplete,
  PlanningTaskCreate,
  PlanningTaskMutationResult
} from "../../../ports/planning-port.js";

export interface SingularityPlanningProviderOptions {
  readonly token: string;
  readonly apiBaseUrl?: string;
  readonly requestTimeoutMs?: number;
  readonly maxResults?: number;
  readonly familyProjectId?: string;
  readonly fetch?: typeof fetch;
}

interface SingularityTaskListResponse {
  readonly tasks?: readonly unknown[];
}

export class SingularityPlanningProvider implements PlanningPort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: SingularityPlanningProviderOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.singularity-app.com";
    this.fetchImpl = options.fetch ?? fetch;
  }

  async queryPlanningState(
    query: PlanningQuery
  ): Promise<PlanningQueryResult> {
    const response = await this.fetchWithTimeout(this.taskListUrl(query), {
      method: "GET",
      headers: {
        authorization: `Bearer ${this.options.token}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Singularity task list request failed: HTTP ${response.status}`
      );
    }

    const payload = (await response.json()) as SingularityTaskListResponse;

    if (!Array.isArray(payload.tasks)) {
      throw new Error("Singularity task list response was incomplete");
    }

    const tokens = query.text
      .toLowerCase()
      .split(/\s+/u)
      .filter(Boolean);

    return {
      items: payload.tasks
        .map(toSearchablePlanningItem)
        .filter((item): item is SearchablePlanningItem => Boolean(item))
        .filter((item) => matchesQuery(item, tokens))
        .map(({ item }) => item)
    };
  }

  async createPlanningTask(
    input: PlanningTaskCreate
  ): Promise<PlanningTaskMutationResult> {
    const response = await this.fetchWithTimeout(this.url("/v2/task"), {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        title: input.title,
        ...(input.scope === "family" && this.options.familyProjectId
          ? { projectId: this.options.familyProjectId }
          : {}),
        ...(input.date ? { start: input.date } : {})
      })
    });

    if (!response.ok) {
      throw new Error(
        `Singularity task create request failed: HTTP ${response.status}`
      );
    }

    const task = toPlanningItem((await response.json()) as unknown, {
      includeInactive: true
    });

    if (!task) {
      throw new Error("Singularity task create response was incomplete");
    }

    for (const [index, title] of (input.checklistItems ?? []).entries()) {
      await this.createChecklistItem(task.id, title, index + 1);
    }

    return {
      item: task
    };
  }

  async completePlanningTask(
    input: PlanningTaskComplete
  ): Promise<PlanningTaskMutationResult> {
    const response = await this.fetchWithTimeout(
      this.url(`/v2/task/${encodeURIComponent(input.taskId)}`),
      {
        method: "PATCH",
        headers: this.jsonHeaders(),
        body: JSON.stringify({
          complete: 1,
          checked: 1,
          completeLast: input.completedAt.toISOString()
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Singularity task complete request failed: HTTP ${response.status}`
      );
    }

    const task = toPlanningItem((await response.json()) as unknown, {
      includeInactive: true
    });

    if (!task) {
      throw new Error("Singularity task complete response was incomplete");
    }

    return {
      item: task
    };
  }

  private taskListUrl(query: PlanningQuery): string {
    const url = new URL("/v2/task", this.apiBaseUrl);
    url.searchParams.set(
      "maxCount",
      String(this.options.maxResults ?? 25)
    );
    url.searchParams.set("includeRemoved", "false");
    url.searchParams.set("includeArchived", "false");
    url.searchParams.set("includeAllRecurrenceInstances", "false");
    if (query.startDateFrom) {
      url.searchParams.set("startDateFrom", query.startDateFrom);
    }
    if (query.startDateTo) {
      url.searchParams.set("startDateTo", query.startDateTo);
    }
    if (query.scope === "family" && this.options.familyProjectId) {
      url.searchParams.set("projectId", this.options.familyProjectId);
    }

    return url.toString();
  }

  private async createChecklistItem(
    parent: string,
    title: string,
    parentOrder: number
  ): Promise<void> {
    const response = await this.fetchWithTimeout(this.url("/v2/checklist-item"), {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        parent,
        title,
        done: false,
        parentOrder
      })
    });

    if (!response.ok) {
      throw new Error(
        `Singularity checklist item create request failed: HTTP ${response.status}`
      );
    }
  }

  private jsonHeaders(): Readonly<Record<string, string>> {
    return {
      authorization: `Bearer ${this.options.token}`,
      "content-type": "application/json"
    };
  }

  private url(path: string): string {
    return new URL(path, this.apiBaseUrl).toString();
  }

  private async fetchWithTimeout(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const timeoutMs = this.options.requestTimeoutMs;
    if (!timeoutMs) {
      return this.fetchImpl(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchImpl(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Singularity request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface SearchablePlanningItem {
  readonly item: PlanningItem;
  readonly searchText: string;
}

function toSearchablePlanningItem(
  value: unknown
): SearchablePlanningItem | undefined {
  const item = toPlanningItem(value);

  if (!item) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  return {
    item,
    searchText: [
      item.id,
      item.title,
      item.status,
      stringField(record, "note"),
      stringField(record, "projectId"),
      ...stringArrayField(record, "tags")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

function toPlanningItem(
  value: unknown,
  options: { readonly includeInactive?: boolean } = {}
): PlanningItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = stringField(value, "id");
  const title = stringField(value, "title");

  if (!id || !title || (!options.includeInactive && isInactiveTask(value))) {
    return undefined;
  }

  const item = {
    id,
    title,
    status:
      isCompletedTask(value)
        ? "completed"
        : stringField(value, "start") || stringField(value, "deadline")
        ? "scheduled"
        : "open"
  };

  return item;
}

function isCompletedTask(task: Record<string, unknown>): boolean {
  return positiveNumberField(task, "complete") || positiveNumberField(task, "checked");
}

function isInactiveTask(task: Record<string, unknown>): boolean {
  return (
    task.removed === true ||
    task.isNote === true ||
    Boolean(stringField(task, "journalDate")) ||
    Boolean(stringField(task, "deleteDate")) ||
    positiveNumberField(task, "complete") ||
    positiveNumberField(task, "checked")
  );
}

function matchesQuery(
  item: SearchablePlanningItem,
  tokens: readonly string[]
): boolean {
  if (tokens.length === 0) {
    return true;
  }

  return tokens.every((token) => item.searchText.includes(token));
}

function stringField(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  const field = value[key];

  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function positiveNumberField(
  value: Record<string, unknown>,
  key: string
): boolean {
  const field = value[key];

  return typeof field === "number" && field > 0;
}

function stringArrayField(
  value: Record<string, unknown>,
  key: string
): readonly string[] {
  const field = value[key];

  if (!Array.isArray(field)) {
    return [];
  }

  return field.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
