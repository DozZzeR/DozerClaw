import { describe, expect, it } from "vitest";

import { MempalaceMemoryProvider } from "../../../src/infrastructure/providers/mempalace/mempalace-memory-provider.js";

describe("MempalaceMemoryProvider", () => {
  it("stores memory entries through mempalace_add_drawer", async () => {
    const fetcher = new RecordingFetch([
      jsonRpcToolResult({
        success: true,
        drawer_id: "drawer-1"
      })
    ]);
    const provider = new MempalaceMemoryProvider({
      endpointUrl: "http://127.0.0.1:4118/mcp",
      bearerToken: "secret",
      wing: "family",
      room: "facts",
      hall: "facts",
      fetch: fetcher.fetch
    });

    await expect(
      provider.store({
        body: "Family fact: Max prefers chamomile tea before sleep.",
        references: ["family_fact:fact-1"]
      })
    ).resolves.toEqual({
      id: "drawer-1",
      body: "Family fact: Max prefers chamomile tea before sleep."
    });
    expect(fetcher.requests).toHaveLength(1);
    expect(fetcher.requests[0]?.url).toBe("http://127.0.0.1:4118/mcp");
    expect(fetcher.requests[0]?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret"
    });
    expect(fetcher.requests[0]?.body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "mempalace_add_drawer",
        arguments: {
          wing: "family",
          room: "facts",
          hall: "facts",
          added_by: "dozerclaw",
          content: [
            "Family fact: Max prefers chamomile tea before sleep.",
            "",
            "References:",
            "- family_fact:fact-1"
          ].join("\n")
        }
      }
    });
  });

  it("searches memory entries through mempalace_search", async () => {
    const fetcher = new RecordingFetch([
      jsonRpcToolResult({
        results: [
          {
            drawer_id: "drawer-1",
            content: "Family fact: Max prefers chamomile tea before sleep.",
            distance: 0.23
          },
          {
            id: "drawer-2",
            text: "Family fact: Sofia likes pasta.",
            score: 0.77
          }
        ]
      })
    ]);
    const provider = new MempalaceMemoryProvider({
      endpointUrl: "http://127.0.0.1:4118/mcp",
      wing: "family",
      room: "facts",
      maxDistance: 1.2,
      fetch: fetcher.fetch
    });

    await expect(
      provider.search({
        text: "Max tea bedtime",
        limit: 5
      })
    ).resolves.toEqual([
      {
        entry: {
          id: "drawer-1",
          body: "Family fact: Max prefers chamomile tea before sleep."
        },
        score: 0.23
      },
      {
        entry: {
          id: "drawer-2",
          body: "Family fact: Sofia likes pasta."
        },
        score: 0.77
      }
    ]);
    expect(fetcher.requests[0]?.body.params.arguments).toEqual({
      query: "Max tea bedtime",
      limit: 5,
      wing: "family",
      room: "facts",
      max_distance: 1.2
    });
  });

  it("replaces entries by deleting drawers that match references before storing", async () => {
    const fetcher = new RecordingFetch([
      jsonRpcToolResult({
        results: [
          {
            drawer_id: "drawer-old",
            content: [
              "Family fact: Max prefers chamomile tea before sleep.",
              "",
              "References:",
              "- family_fact:fact-1"
            ].join("\n")
          },
          {
            drawer_id: "drawer-other",
            content: "Family fact: Sofia likes pasta."
          }
        ]
      }),
      jsonRpcToolResult({
        success: true,
        drawer_id: "drawer-old"
      }),
      jsonRpcToolResult({
        success: true,
        drawer_id: "drawer-new"
      })
    ]);
    const provider = new MempalaceMemoryProvider({
      endpointUrl: "http://127.0.0.1:4118/mcp",
      wing: "family",
      room: "facts",
      fetch: fetcher.fetch
    });

    await expect(
      provider.replace({
        body: "Family fact: Max prefers peppermint tea before sleep.",
        references: ["family_fact:fact-1"]
      })
    ).resolves.toEqual({
      id: "drawer-new",
      body: "Family fact: Max prefers peppermint tea before sleep."
    });
    expect(fetcher.requests.map((request) => request.body.params.name)).toEqual([
      "mempalace_search",
      "mempalace_delete_drawer",
      "mempalace_add_drawer"
    ]);
    expect(fetcher.requests[0]?.body.params.arguments).toEqual({
      query: "family_fact:fact-1",
      limit: 20,
      wing: "family",
      room: "facts"
    });
    expect(fetcher.requests[1]?.body.params.arguments).toEqual({
      drawer_id: "drawer-old"
    });
  });

  it("updates an existing memory entry through mempalace_update_drawer", async () => {
    const fetcher = new RecordingFetch([
      jsonRpcToolResult({
        success: true,
        drawer_id: "drawer-1"
      })
    ]);
    const provider = new MempalaceMemoryProvider({
      endpointUrl: "http://127.0.0.1:4118/mcp",
      wing: "family",
      room: "facts",
      fetch: fetcher.fetch
    });

    await expect(
      provider.update("drawer-1", {
        body: "Family fact: Max prefers peppermint tea before sleep.",
        references: ["family_fact:fact-1"]
      })
    ).resolves.toEqual({
      id: "drawer-1",
      body: "Family fact: Max prefers peppermint tea before sleep."
    });
    expect(fetcher.requests[0]?.body).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "mempalace_update_drawer",
        arguments: {
          drawer_id: "drawer-1",
          content: [
            "Family fact: Max prefers peppermint tea before sleep.",
            "",
            "References:",
            "- family_fact:fact-1"
          ].join("\n")
        }
      }
    });
  });

  it("throws when MemPalace returns a JSON-RPC error", async () => {
    const fetcher = new RecordingFetch([
      {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32000,
            message: "Internal tool error"
          }
        })
      }
    ]);
    const provider = new MempalaceMemoryProvider({
      endpointUrl: "http://127.0.0.1:4118/mcp",
      wing: "family",
      room: "facts",
      fetch: fetcher.fetch
    });

    await expect(
      provider.search({
        text: "Max",
        limit: 5
      })
    ).rejects.toThrow("MemPalace JSON-RPC error: Internal tool error");
  });
});

interface RecordedRequest {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: any;
}

class RecordingFetch {
  readonly requests: RecordedRequest[] = [];

  constructor(private readonly responses: readonly FakeResponse[]) {}

  fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    this.requests.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body))
    });
    const response = this.responses[this.requests.length - 1];

    if (!response) {
      throw new Error("no queued response");
    }

    return response as Response;
  };
}

interface FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

function jsonRpcToolResult(payload: unknown): FakeResponse {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload)
            }
          ]
        }
      };
    }
  };
}
