import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { createSqliteDatabase } from "../../infrastructure/providers/sqlite/sqlite-database.js";

export interface DevPendingRoutingEventsOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
}

interface PendingRoutingEventRow {
  readonly occurredAt: string;
  readonly attributesJson: string;
}

export async function runDevPendingRoutingEvents(
  options: DevPendingRoutingEventsOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write(
      "dev pending routing events listing is not available in production."
    );

    return 1;
  }

  const config = loadConfig(options.env);
  const limit = parsePositiveInteger(
    options.env.DOZERCLAW_DEV_PENDING_ROUTING_LIMIT,
    20
  );
  const database = createSqliteDatabase({ path: config.sqlite.databasePath });

  try {
    const rows = database
      .prepare(
        `
          select occurred_at as occurredAt, attributes_json as attributesJson
          from operational_events
          where type = 'messaging.pending_routing'
          order by id desc
          limit @limit
        `
      )
      .all({ limit }) as PendingRoutingEventRow[];

    if (rows.length === 0) {
      options.write("pending routing events: none");

      return 0;
    }

    options.write("pending routing events:");

    for (const row of rows) {
      options.write(formatPendingRoutingEvent(row));
    }

    return 0;
  } finally {
    database.close();
  }
}

function formatPendingRoutingEvent(row: PendingRoutingEventRow): string {
  const attributes = parseAttributes(row.attributesJson);
  const pendingKind = stringAttribute(attributes, "pending_kind", "unknown");
  const policy = stringAttribute(attributes, "policy", "unknown");
  const choice = stringAttribute(attributes, "choice_result", "unknown");
  const interruption = stringAttribute(attributes, "interruption_intent");
  const cleared = booleanAttribute(attributes, "pending_cleared");

  return [
    `- ${row.occurredAt}`,
    pendingKind,
    `policy=${policy}`,
    `choice=${choice}`,
    ...(interruption ? [`interruption=${interruption}`] : []),
    `cleared=${cleared}`
  ].join(" ");
}

function parseAttributes(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;

    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringAttribute(
  attributes: Record<string, unknown>,
  key: string,
  fallback?: string
): string | undefined {
  const value = attributes[key];

  return typeof value === "string" ? value : fallback;
}

function booleanAttribute(
  attributes: Record<string, unknown>,
  key: string
): boolean | "unknown" {
  const value = attributes[key];

  return typeof value === "boolean" ? value : "unknown";
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevPendingRoutingEvents({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
