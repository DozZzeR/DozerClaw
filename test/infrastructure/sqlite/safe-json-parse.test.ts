import { inspect } from "node:util";
import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import {
  SqliteStateRepository,
  StateDataError,
  safeJsonParse
} from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}', "ctx")).toEqual({ a: 1 });
  });

  it("throws a StateDataError with the column context on corrupt JSON", () => {
    expect(() =>
      safeJsonParse("{not json", "pending_state.shopping_items")
    ).toThrow(StateDataError);

    try {
      safeJsonParse("{not json", "pending_state.shopping_items");
    } catch (error) {
      expect(error).toBeInstanceOf(StateDataError);
      expect((error as StateDataError).message).toContain(
        "pending_state.shopping_items"
      );
    }
  });

  it("does not leak the raw payload in message or util.inspect output", () => {
    const secret = '{"body":"SECRET family detail","broken"';

    expect(() => safeJsonParse(secret, "family_facts")).toThrow(StateDataError);

    try {
      safeJsonParse(secret, "family_facts");
    } catch (error) {
      expect((error as Error).message).not.toContain("SECRET family detail");
      expect(inspect(error)).not.toContain("SECRET family detail");
    }
  });

  it("isolates and clears a corrupt pending_document_decisions row (e.g. action_json = 'null')", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    try {
      const repository = new SqliteStateRepository(database);
      database
        .prepare(
          `
            insert into pending_document_decisions (
              chat_id,
              actor_id,
              action_json,
              candidates_json,
              created_at,
              expires_at
            )
            values (?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          "chat-corrupt",
          "actor-1",
          "null",
          "[]",
          "2026-09-07T09:00:00.000Z",
          "2026-09-07T11:00:00.000Z"
        );

      await expect(
        repository.findActivePendingDocumentDecisionByChatId(
          "chat-corrupt",
          new Date("2026-09-07T10:00:00.000Z")
        )
      ).resolves.toBeUndefined();

      const remaining = database
        .prepare(
          "select count(*) as count from pending_document_decisions where chat_id = ?"
        )
        .get("chat-corrupt") as { readonly count: number };

      expect(remaining.count).toBe(0);
    } finally {
      database.close();
    }
  });
});
