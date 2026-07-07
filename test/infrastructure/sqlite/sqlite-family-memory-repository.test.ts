import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFamilyMemoryRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-family-memory-repository.js";

describe("SqliteFamilyMemoryRepository", () => {
  it("persists and lists recent active family facts newest first", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteFamilyMemoryRepository(database);

    await repository.saveFamilyFact({
      id: "fact-old",
      category: "event",
      body: "Max started swimming lessons.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "remember Max started swimming lessons",
      status: "active",
      createdAt: new Date("2026-07-07T09:00:00.000Z"),
      updatedAt: new Date("2026-07-07T09:00:00.000Z")
    });
    await repository.saveFamilyFact({
      id: "fact-new",
      category: "preference",
      body: "Max prefers chamomile tea.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "remember Max prefers chamomile tea",
      status: "active",
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      updatedAt: new Date("2026-07-07T10:00:00.000Z")
    });
    await repository.saveFamilyFact({
      id: "fact-archived",
      category: "place",
      body: "Old archived place.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "archive this",
      status: "archived",
      createdAt: new Date("2026-07-07T11:00:00.000Z"),
      updatedAt: new Date("2026-07-07T11:00:00.000Z")
    });

    await expect(repository.listRecentActiveFamilyFacts(10)).resolves.toEqual([
      {
        id: "fact-new",
        category: "preference",
        body: "Max prefers chamomile tea.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max prefers chamomile tea",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      },
      {
        id: "fact-old",
        category: "event",
        body: "Max started swimming lessons.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max started swimming lessons",
        status: "active",
        createdAt: new Date("2026-07-07T09:00:00.000Z"),
        updatedAt: new Date("2026-07-07T09:00:00.000Z")
      }
    ]);

    database.close();
  });
});
