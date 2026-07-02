import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteEventLog } from "../../../src/infrastructure/providers/sqlite/sqlite-event-log.js";

describe("SqliteEventLog", () => {
  it("persists structured operational events", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const eventLog = new SqliteEventLog(database);

    await eventLog.record({
      type: "diagnostic.test",
      occurredAt: new Date("2026-07-02T20:00:00.000Z"),
      attributes: {
        ok: true,
        count: 1,
        source: "test"
      }
    });

    const row = database
      .prepare(
        "select type, occurred_at, attributes_json from operational_events"
      )
      .get() as {
      type: string;
      occurred_at: string;
      attributes_json: string;
    };

    expect(row).toEqual({
      type: "diagnostic.test",
      occurred_at: "2026-07-02T20:00:00.000Z",
      attributes_json: JSON.stringify({
        ok: true,
        count: 1,
        source: "test"
      })
    });

    database.close();
  });
});
