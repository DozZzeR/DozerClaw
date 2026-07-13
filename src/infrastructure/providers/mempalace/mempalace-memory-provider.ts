import type {
  MemoryEntry,
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery,
  MemorySearchResult
} from "../../../ports/memory-port.js";

export interface MempalaceMemoryProviderOptions {
  readonly endpointUrl: string;
  readonly wing: string;
  readonly room: string;
  readonly hall?: string;
  readonly bearerToken?: string;
  readonly maxDistance?: number;
  readonly fetch?: typeof fetch;
}

interface JsonRpcToolResponse {
  readonly result?: {
    readonly content?: readonly {
      readonly type?: string;
      readonly text?: string;
    }[];
  };
  readonly error?: {
    readonly message?: string;
  };
}

interface MempalaceSearchPayload {
  readonly results?: readonly unknown[];
}

type MempalaceSearchResultRow = Record<string, unknown>;

interface MempalaceListDrawersPayload {
  readonly drawers?: readonly unknown[];
}

export class MempalaceMemoryProvider implements MemoryPort {
  private nextRequestId = 1;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: MempalaceMemoryProviderOptions) {
    this.fetcher = options.fetch ?? fetch;
  }

  async store(input: MemoryEntryInput): Promise<MemoryEntry> {
    const content = formatStoredContent(input);
    const payload = await this.callTool("mempalace_add_drawer", {
      wing: this.options.wing,
      room: this.options.room,
      content,
      added_by: "dozerclaw",
      ...(this.options.hall ? { hall: this.options.hall } : {})
    });

    return {
      id: drawerIdFromPayload(payload) ?? "mempalace-drawer",
      body: input.body
    };
  }

  async search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]> {
    const payload = (await this.callTool("mempalace_search", {
      query: query.text,
      limit: query.limit,
      wing: this.options.wing,
      room: this.options.room,
      ...(this.options.maxDistance === undefined
        ? {}
        : { max_distance: this.options.maxDistance })
    })) as MempalaceSearchPayload;

    return (payload.results ?? [])
      .map(toMemorySearchResult)
      .filter((result): result is MemorySearchResult => Boolean(result));
  }

  async update(entryId: string, input: MemoryEntryInput): Promise<MemoryEntry> {
    await this.callTool("mempalace_update_drawer", {
      drawer_id: entryId,
      content: formatStoredContent(input)
    });

    return {
      id: entryId,
      body: input.body
    };
  }

  async replace(input: MemoryEntryInput): Promise<MemoryEntry> {
    await this.deleteEntriesMatchingReferences(input.references ?? []);

    return this.store(input);
  }

  private async deleteEntriesMatchingReferences(
    references: readonly string[]
  ): Promise<void> {
    const drawerIds = new Set<string>();

    for (const reference of references) {
      const payload = (await this.callTool("mempalace_search", {
        query: reference,
        limit: 20,
        wing: this.options.wing,
        room: this.options.room,
        ...(this.options.maxDistance === undefined
          ? {}
          : { max_distance: this.options.maxDistance })
      })) as MempalaceSearchPayload;
      const matchingRows = (payload.results ?? [])
        .filter(isRecord)
        .filter((row) =>
          (textField(row, ["content", "text", "body"]) ?? "").includes(reference)
        );

      for (const row of matchingRows) {
        const drawerId = drawerIdFromRow(row);

        if (drawerId) {
          drawerIds.add(drawerId);
        }
      }

      if (
        matchingRows.length > 0 &&
        matchingRows.some((row) => !drawerIdFromRow(row))
      ) {
        for (const drawerId of await this.listDrawerIdsMatchingReference(
          reference
        )) {
          drawerIds.add(drawerId);
        }
      }
    }

    for (const drawerId of drawerIds) {
      await this.callTool("mempalace_delete_drawer", {
        drawer_id: drawerId
      });
    }
  }

  private async listDrawerIdsMatchingReference(
    reference: string
  ): Promise<readonly string[]> {
    const payload = (await this.callTool("mempalace_list_drawers", {
      wing: this.options.wing,
      room: this.options.room,
      limit: 100
    })) as MempalaceListDrawersPayload;

    return (payload.drawers ?? [])
      .filter(isRecord)
      .filter((row) =>
        (
          textField(row, ["content", "content_preview", "text", "body"]) ?? ""
        ).includes(reference)
      )
      .map(drawerIdFromRow)
      .filter((drawerId): drawerId is string => Boolean(drawerId));
  }

  private async callTool(
    name:
      | "mempalace_add_drawer"
      | "mempalace_delete_drawer"
      | "mempalace_list_drawers"
      | "mempalace_update_drawer"
      | "mempalace_search",
    args: Record<string, unknown>
  ): Promise<unknown> {
    const response = await this.fetcher(this.options.endpointUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method: "tools/call",
        params: {
          name,
          arguments: args
        }
      })
    });

    if (!response.ok) {
      throw new Error(`MemPalace HTTP error: ${response.status}`);
    }

    const json = (await response.json()) as JsonRpcToolResponse;

    if (json.error) {
      throw new Error(
        `MemPalace JSON-RPC error: ${json.error.message ?? "unknown error"}`
      );
    }

    const text = json.result?.content?.find((item) => item.type === "text")?.text;

    if (!text) {
      return {};
    }

    return JSON.parse(text) as unknown;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.options.bearerToken
        ? { Authorization: `Bearer ${this.options.bearerToken}` }
        : {})
    };
  }
}

function formatStoredContent(input: MemoryEntryInput): string {
  if (!input.references || input.references.length === 0) {
    return input.body;
  }

  return [
    input.body,
    "",
    "References:",
    ...input.references.map((reference) => `- ${reference}`)
  ].join("\n");
}

function drawerIdFromPayload(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const drawerId = payload.drawer_id ?? payload.drawerId ?? payload.id;

  return typeof drawerId === "string" ? drawerId : undefined;
}

function toMemorySearchResult(
  row: unknown
): MemorySearchResult | undefined {
  if (!isRecord(row)) {
    return undefined;
  }

  const body = textField(row, ["content", "text", "body"]);

  if (!body) {
    return undefined;
  }

  return {
    entry: {
      id: drawerIdFromRow(row) ?? "mempalace-drawer",
      body
    },
    ...numericScore(row)
  };
}

function drawerIdFromRow(row: MempalaceSearchResultRow): string | undefined {
  return textField(row, ["drawer_id", "drawerId", "id", "parent_drawer_id"]);
}

function textField(
  row: MempalaceSearchResultRow,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function numericScore(
  row: MempalaceSearchResultRow
): Pick<MemorySearchResult, "score"> {
  const value = row.score ?? row.distance;

  return typeof value === "number" ? { score: value } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
