import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteShoppingRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-shopping-repository.js";

describe("SqliteShoppingRepository", () => {
  it("persists and lists recent active shopping items newest first", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteShoppingRepository(database);

    await repository.saveShoppingItem({
      id: "shopping-old",
      title: "two plywood sheets",
      storeHint: "uradi_sam",
      projectTag: "repair",
      tags: ["plywood", "repair"],
      semanticMemoryEntryId: "drawer-shopping-old",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "купить в уради сам два листа фанеры",
      status: "open",
      createdAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z")
    });
    await repository.saveShoppingItem({
      id: "shopping-new",
      title: "wood screws",
      projectTag: "repair",
      tags: ["screws", "repair"],
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "ремонт, купить шурупов",
      status: "open",
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z")
    });
    await repository.saveShoppingItem({
      id: "shopping-archived",
      title: "paint roller",
      projectTag: "repair",
      tags: ["paint"],
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "валик",
      status: "archived",
      createdAt: new Date("2026-08-03T10:00:00.000Z"),
      updatedAt: new Date("2026-08-03T10:00:00.000Z")
    });

    await expect(repository.listRecentOpenShoppingItems(10)).resolves.toEqual([
      {
        id: "shopping-new",
        title: "wood screws",
        projectTag: "repair",
        tags: ["screws", "repair"],
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "ремонт, купить шурупов",
        status: "open",
        createdAt: new Date("2026-08-02T10:00:00.000Z"),
        updatedAt: new Date("2026-08-02T10:00:00.000Z")
      },
      {
        id: "shopping-old",
        title: "two plywood sheets",
        storeHint: "uradi_sam",
        projectTag: "repair",
        tags: ["plywood", "repair"],
        semanticMemoryEntryId: "drawer-shopping-old",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "купить в уради сам два листа фанеры",
        status: "open",
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-01T10:00:00.000Z")
      }
    ]);

    await repository.saveShoppingItem({
      id: "shopping-new",
      title: "wood screws",
      projectTag: "repair",
      tags: ["screws", "repair"],
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "ремонт, купить шурупов",
      status: "bought",
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
      updatedAt: new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(repository.listRecentOpenShoppingItems(10)).resolves.toEqual([
      expect.objectContaining({
        id: "shopping-old",
        status: "open"
      })
    ]);

    database.close();
  });
});
