import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevPendingRoutingEvents } from "../../../src/entrypoints/cli/dev-pending-routing-events.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteEventLog } from "../../../src/infrastructure/providers/sqlite/sqlite-event-log.js";

describe("runDevPendingRoutingEvents", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevPendingRoutingEvents({
      env: {
        NODE_ENV: "production"
      },
      write(line) {
        lines.push(line);
      }
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev pending routing events listing is not available in production."
    ]);
  });

  it("prints an empty state when no pending routing events exist", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-routing-events-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const lines: string[] = [];

    try {
      const exitCode = await runDevPendingRoutingEvents({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual(["pending routing events: none"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("prints recent pending routing events newest first", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-routing-events-"));
    const databasePath = join(directory, "dozerclaw.sqlite");
    const database = createSqliteDatabase({ path: databasePath });
    const eventLog = new SqliteEventLog(database);
    const lines: string[] = [];

    try {
      await eventLog.record({
        type: "messaging.pending_routing",
        occurredAt: new Date("2026-07-02T20:00:00.000Z"),
        attributes: {
          pending_kind: "file_destination",
          policy: "safe_interruptible",
          choice_result: "unclear",
          interruption_intent: "record_fact",
          pending_cleared: true
        }
      });
      await eventLog.record({
        type: "messaging.pending_routing",
        occurredAt: new Date("2026-07-02T20:01:00.000Z"),
        attributes: {
          pending_kind: "document_placement",
          policy: "safe_interruptible",
          choice_result: "store_file",
          pending_cleared: false
        }
      });
      database.close();

      const exitCode = await runDevPendingRoutingEvents({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: databasePath,
          DOZERCLAW_DEV_PENDING_ROUTING_LIMIT: "5"
        },
        write(line) {
          lines.push(line);
        }
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual([
        "pending routing events:",
        "- 2026-07-02T20:01:00.000Z document_placement policy=safe_interruptible choice=store_file cleared=false",
        "- 2026-07-02T20:00:00.000Z file_destination policy=safe_interruptible choice=unclear interruption=record_fact cleared=true"
      ]);
    } finally {
      if (database.open) {
        database.close();
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
