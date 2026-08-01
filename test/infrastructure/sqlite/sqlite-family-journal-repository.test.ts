import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFamilyJournalRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-family-journal-repository.js";

describe("SqliteFamilyJournalRepository", () => {
  it("persists and lists recent active journal entries newest first", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteFamilyJournalRepository(database);

    await repository.saveFamilyJournalEntry({
      id: "journal-1",
      category: "health",
      body: "Sofia coughed at night.",
      subjectId: "sofia",
      semanticMemoryEntryId: "drawer-1",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "source text",
      status: "active",
      occurredAt: new Date("2026-08-01T10:00:00.000Z"),
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z")
    });
    await repository.saveFamilyJournalEntry({
      id: "journal-2",
      category: "sleep",
      body: "Max slept well.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "source text",
      status: "archived",
      occurredAt: new Date("2026-08-02T10:00:00.000Z"),
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z")
    });

    await expect(
      repository.listRecentActiveFamilyJournalEntries(10)
    ).resolves.toEqual([
      {
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night.",
        subjectId: "sofia",
        semanticMemoryEntryId: "drawer-1",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "source text",
        status: "active",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-01T10:00:00.000Z")
      }
    ]);

    database.close();
  });
});
