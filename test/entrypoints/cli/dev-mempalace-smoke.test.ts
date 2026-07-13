import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevMempalaceSmoke } from "../../../src/entrypoints/cli/dev-mempalace-smoke.js";

describe("runDevMempalaceSmoke", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevMempalaceSmoke({
      env: {
        NODE_ENV: "production"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev mempalace smoke is not available in production."
    ]);
  });

  it("requires MemPalace runtime config", async () => {
    const lines: string[] = [];

    const exitCode = await runDevMempalaceSmoke({
      env: {
        NODE_ENV: "test",
        DOZERCLAW_DB_PATH: ":memory:"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["DOZERCLAW_MEMPALACE_MCP_URL is required."]);
  });

  it("records, indexes, and recalls a family fact through runtime composition", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-mempalace-smoke-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const mempalace = await startMempalaceStub();
    const lines: string[] = [];

    try {
      const exitCode = await runDevMempalaceSmoke({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_MEMPALACE_MCP_URL: mempalace.url,
          DOZERCLAW_MEMPALACE_BEARER_TOKEN: "secret",
          DOZERCLAW_MEMPALACE_WING: "family",
          DOZERCLAW_MEMPALACE_ROOM: "facts",
          DOZERCLAW_MEMPALACE_HALL: "facts",
          DOZERCLAW_DEV_MEMPALACE_SMOKE_BODY:
            "Smoke child prefers kiwi before chess.",
          DOZERCLAW_DEV_MEMPALACE_SMOKE_QUERY:
            "what does Smoke child prefer before chess?"
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual([
        "record_reply=Saved family fact: Smoke child prefers kiwi before chess.",
        expect.stringMatching(/^sqlite_fact=fact:.+ semantic:drawer-/),
        "mempalace_match=true",
        "recall_reply=Smoke child prefers kiwi before chess."
      ]);
      expect(mempalace.authorizationHeaders).toEqual([
        "Bearer secret",
        "Bearer secret",
        "Bearer secret"
      ]);
      expect(mempalace.requests.map((request) => request.params.name)).toEqual([
        "mempalace_add_drawer",
        "mempalace_search",
        "mempalace_search"
      ]);
    } finally {
      await mempalace.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("prints recall diagnostics when trace flag is enabled", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-mempalace-smoke-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const mempalace = await startMempalaceStub();
    const lines: string[] = [];

    try {
      const exitCode = await runDevMempalaceSmoke({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_MEMPALACE_MCP_URL: mempalace.url,
          DOZERCLAW_MEMPALACE_BEARER_TOKEN: "secret",
          DOZERCLAW_MEMPALACE_WING: "family",
          DOZERCLAW_MEMPALACE_ROOM: "facts",
          DOZERCLAW_MEMPALACE_HALL: "facts",
          DOZERCLAW_DEV_MEMPALACE_SMOKE_BODY:
            "Smoke child prefers kiwi before chess.",
          DOZERCLAW_DEV_MEMPALACE_SMOKE_QUERY:
            "what does Smoke child prefer before chess?",
          DOZERCLAW_DEV_MEMPALACE_SMOKE_TRACE_RECALL: "1"
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual([
        "record_reply=Saved family fact: Smoke child prefers kiwi before chess.",
        expect.stringMatching(/^sqlite_fact=fact:.+ semantic:drawer-/),
        "mempalace_match=true",
        "recall_reply=Smoke child prefers kiwi before chess.",
        "recall_trace=recall.local_candidates=1",
        "recall_trace=recall.semantic_candidates=1",
        expect.stringMatching(/^recall_trace=recall.selected_ids=.+/),
        "recall_trace=recall.synthesis=accepted"
      ]);
    } finally {
      await mempalace.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

interface MempalaceRequest {
  readonly params: {
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  };
}

async function startMempalaceStub() {
  const requests: MempalaceRequest[] = [];
  const authorizationHeaders: string[] = [];
  const drawers = new Map<string, string>();
  let drawerSequence = 1;
  const server = createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      if (request.method !== "POST") {
        response.writeHead(404);
        response.end();

        return;
      }

      const body = JSON.parse(await readRequestBody(request)) as MempalaceRequest;
      requests.push(body);
      authorizationHeaders.push(String(request.headers.authorization ?? ""));

      const toolName = body.params.name;
      const args = body.params.arguments;
      let payload: unknown;

      if (toolName === "mempalace_add_drawer") {
        const drawerId = `drawer-${drawerSequence++}`;
        drawers.set(drawerId, String(args.content));
        payload = {
          success: true,
          drawer_id: drawerId
        };
      } else if (toolName === "mempalace_search") {
        const query = String(args.query ?? "");
        const queryTokens = query
          .toLowerCase()
          .split(/[^a-z0-9а-яё]+/iu)
          .filter((token) => token.length >= 4);
        payload = {
          results: [...drawers.entries()]
            .filter(([, content]) =>
              queryTokens.some((token) => content.toLowerCase().includes(token))
            )
            .map(([drawerId, content]) => ({
              drawer_id: drawerId,
              content,
              distance: 0.1
            }))
        };
      } else {
        payload = {
          success: true
        };
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
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
        })
      );
    }
  );

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("stub server did not bind a TCP port");
  }

  return {
    requests,
    authorizationHeaders,
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  };
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
