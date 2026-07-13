import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import { buildApp } from "../../composition/build-app.js";
import { loadConfig } from "../../composition/config.js";
import type { FamilyFact } from "../../core/domain/family-memory/family-fact.js";
import { MempalaceMemoryProvider } from "../../infrastructure/providers/mempalace/mempalace-memory-provider.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFamilyMemoryRepository } from "../../infrastructure/providers/sqlite/sqlite-family-memory-repository.js";
import type {
  ModelPort,
  ModelTextRequest,
  ModelTextResponse
} from "../../ports/model-port.js";

export interface DevMempalaceSmokeOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
  readonly modelProvider?: ModelPort;
}

export async function runDevMempalaceSmoke(
  options: DevMempalaceSmokeOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev mempalace smoke is not available in production.");

    return 1;
  }

  const config = loadConfig(options.env);

  if (!config.memory?.mempalace) {
    options.write("DOZERCLAW_MEMPALACE_MCP_URL is required.");

    return 1;
  }

  const smokeRunId = randomUUID();
  const provider = options.env.DOZERCLAW_DEV_PROVIDER ?? "dev";
  const providerUserId = options.env.DOZERCLAW_DEV_OWNER_USER_ID ?? "owner";
  const providerChatId =
    options.env.DOZERCLAW_DEV_MEMPALACE_SMOKE_CHAT_ID ??
    `owner-private-smoke-${smokeRunId}`;
  const displayName = options.env.DOZERCLAW_DEV_OWNER_NAME ?? "Owner";
  const body =
    options.env.DOZERCLAW_DEV_MEMPALACE_SMOKE_BODY ??
    `Runtime probe ${smokeRunId} records marmalade orbit.`;
  const query =
    options.env.DOZERCLAW_DEV_MEMPALACE_SMOKE_QUERY ??
    "what does the smoke family fact say?";
  const now = new Date();
  const semanticMemory = new MempalaceMemoryProvider(config.memory.mempalace);
  const modelProvider =
    options.modelProvider ?? new DevMempalaceSmokeModelProvider(body);
  const app = buildApp({
    env: options.env,
    modelProvider
  });

  await app.bootstrapOwnerIdentity({
    provider,
    providerUserId,
    providerChatId,
    displayName
  });

  const recordReply = await app.handleNormalizedInboundMessage({
    messageId: `dev-mempalace-smoke-record-${now.toISOString()}`,
    provider,
    providerUserId,
    providerChatId,
    chatKind: "owner_private",
    displayName,
    text: `remember ${body}`,
    attachments: [],
    receivedAt: now,
    now
  });

  options.write(`record_reply=${recordReply.text}`);

  const fact = await findSmokeFact(config.sqlite.databasePath, body);

  if (!fact) {
    options.write("sqlite_fact=missing");

    return 1;
  }

  options.write(
    `sqlite_fact=fact:${fact.id} semantic:${fact.semanticMemoryEntryId ?? "missing"}`
  );

  if (!fact.semanticMemoryEntryId) {
    return 1;
  }

  const semanticResults = await semanticMemory.search({
    text: body,
    limit: config.memory.mempalace.searchLimit
  });
  const mempalaceMatched = semanticResults.some((result) =>
    result.entry.body.includes(body)
  );

  options.write(`mempalace_match=${mempalaceMatched}`);

  if (!mempalaceMatched) {
    return 1;
  }

  const recallReply = await app.handleNormalizedInboundMessage({
    messageId: `dev-mempalace-smoke-recall-${now.toISOString()}`,
    provider,
    providerUserId,
    providerChatId,
    chatKind: "owner_private",
    displayName,
    text: query,
    attachments: [],
    receivedAt: now,
    now
  });

  options.write(`recall_reply=${recallReply.text}`);

  return recallReply.text.includes(body) ? 0 : 1;
}

class DevMempalaceSmokeModelProvider implements ModelPort {
  constructor(private readonly body: string) {}

  async runTextRequest(
    request: ModelTextRequest
  ): Promise<ModelTextResponse> {
    if (request.purpose === "Classify DozerClaw inbound family message intent") {
      if (request.input.includes("remember")) {
        return {
          text: JSON.stringify({
            kind: "record_fact",
            question: null,
            summary: this.body,
            category: "preference",
            subjectId: "smoke",
            query: null,
            reason: null
          })
        };
      }

      return {
        text: JSON.stringify({
          kind: "answer_from_memory",
          question: null,
          summary: null,
          category: null,
          subjectId: null,
          query: request.input,
          reason: null
        })
      };
    }

    if (request.purpose === "Select relevant DozerClaw family facts") {
      return {
        text: JSON.stringify({
          factIds: factIdsFromPrompt(request.input)
        })
      };
    }

    if (request.purpose === "Synthesize DozerClaw family memory answer") {
      return {
        text: this.body
      };
    }

    return {
      text: this.body
    };
  }
}

async function findSmokeFact(
  databasePath: string,
  body: string
): Promise<FamilyFact | undefined> {
  const database = createSqliteDatabase({ path: databasePath });
  const repository = new SqliteFamilyMemoryRepository(database);

  try {
    const facts = await repository.listRecentActiveFamilyFacts(100);

    return facts.find((fact) => fact.body === body);
  } finally {
    database.close();
  }
}

function factIdsFromPrompt(prompt: string): readonly string[] {
  const ids = new Set<string>();
  const pattern = /"id":\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(prompt)) !== null) {
    ids.add(match[1]!);
  }

  return [...ids];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevMempalaceSmoke({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
