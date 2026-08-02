import { afterEach, describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteMessageReceiptRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-message-receipt-repository.js";

describe("SqliteMessageReceiptRepository", () => {
  const databases: ReturnType<typeof createSqliteDatabase>[] = [];

  afterEach(() => {
    for (const database of databases.splice(0)) {
      database.close();
    }
  });

  it("stores and retrieves a reply by provider message identity", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    databases.push(database);
    const repository = new SqliteMessageReceiptRepository(database);

    await repository.save({
      provider: "telegram",
      providerChatId: "chat-1",
      messageId: "message-1",
      reply: { chatId: "internal-chat", text: "saved" },
      processedAt: new Date("2026-07-24T10:00:00.000Z")
    });

    await expect(
      repository.find({
        provider: "telegram",
        providerChatId: "chat-1",
        messageId: "message-1"
      })
    ).resolves.toEqual({ chatId: "internal-chat", text: "saved" });
    await expect(
      repository.find({
        provider: "telegram",
        providerChatId: "chat-1",
        messageId: "message-2"
      })
    ).resolves.toBeUndefined();
  });
});
