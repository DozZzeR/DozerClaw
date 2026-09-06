import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { purgeExpiredState } from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

function insertClarification(
  database: ReturnType<typeof createSqliteDatabase>,
  chatId: string,
  expiresAt: string
): void {
  database
    .prepare(
      `
        insert into pending_clarifications (
          chat_id,
          actor_id,
          original_text,
          original_attachments_json,
          question,
          created_at,
          expires_at
        )
        values (?, 'actor', 'text', '[]', 'question?', '2026-01-01T00:00:00.000Z', ?)
      `
    )
    .run(chatId, expiresAt);
}

describe("purgeExpiredState", () => {
  it("removes only rows whose expires_at is before now", () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const now = new Date("2026-07-20T12:00:00.000Z");

    insertClarification(database, "chat-expired", "2026-07-20T11:00:00.000Z");
    insertClarification(database, "chat-fresh", "2026-07-20T13:00:00.000Z");

    const removed = purgeExpiredState(database, now);

    expect(removed).toBe(1);

    const remaining = database
      .prepare("select chat_id from pending_clarifications")
      .all() as { readonly chat_id: string }[];

    expect(remaining.map((row) => row.chat_id)).toEqual(["chat-fresh"]);
  });

  it("returns zero when nothing is expired", () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const now = new Date("2026-07-20T12:00:00.000Z");

    insertClarification(database, "chat-fresh", "2026-07-20T13:00:00.000Z");

    expect(purgeExpiredState(database, now)).toBe(0);
  });
});
