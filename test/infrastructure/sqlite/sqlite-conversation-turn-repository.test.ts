import { describe, expect, it } from "vitest";

import { SqliteConversationTurnRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-conversation-turn-repository.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { purgeExpiredState } from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

describe("SqliteConversationTurnRepository", () => {
  it("stores turns in chronological order, isolates chatIds, enforces idempotency and retention cap, and purges expired rows", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    try {
      const repo = new SqliteConversationTurnRepository(database, {
        maxStoredTurnsPerChat: 4
      });
      const t0 = new Date("2026-11-26T08:00:00.000Z");
      const ttl = 60 * 60 * 1000;

      // Append turn pair for chat-A with sourceMessageKey
      await repo.appendTurns({
        chatId: "chat-A",
        createdAt: t0,
        expiresAt: new Date(t0.getTime() + ttl),
        turns: [
          {
            actorId: "actor-1",
            role: "user",
            text: "/digest",
            sourceMessageKey: "tg:1:m1"
          },
          {
            role: "assistant",
            text: "Дайджест на 2026-11-26",
            sourceMessageKey: "tg:1:m1"
          }
        ]
      });

      // Duplicate write with same sourceMessageKey is idempotently ignored
      await repo.appendTurns({
        chatId: "chat-A",
        createdAt: t0,
        expiresAt: new Date(t0.getTime() + ttl),
        turns: [
          {
            actorId: "actor-1",
            role: "user",
            text: "/digest",
            sourceMessageKey: "tg:1:m1"
          },
          {
            role: "assistant",
            text: "Дайджест на 2026-11-26",
            sourceMessageKey: "tg:1:m1"
          }
        ]
      });

      // Separate chat-B is strictly isolated
      await repo.appendTurns({
        chatId: "chat-B",
        createdAt: t0,
        expiresAt: new Date(t0.getTime() + ttl),
        turns: [
          {
            actorId: "actor-2",
            role: "user",
            text: "Private chat B message",
            sourceMessageKey: "tg:2:m1"
          }
        ]
      });

      const turnsA = await repo.listRecentActiveByChatId(
        "chat-A",
        new Date("2026-11-26T08:05:00.000Z"),
        8
      );
      expect(turnsA).toHaveLength(2);
      expect(turnsA.map((t) => `${t.role}:${t.text}`)).toEqual([
        "user:/digest",
        "assistant:Дайджест на 2026-11-26"
      ]);

      const turnsB = await repo.listRecentActiveByChatId(
        "chat-B",
        new Date("2026-11-26T08:05:00.000Z"),
        8
      );
      expect(turnsB).toHaveLength(1);
      expect(turnsB[0]?.text).toBe("Private chat B message");

      // Exceeding maxStoredTurnsPerChat (4) evicts oldest turns for chat-A only
      const t1 = new Date("2026-11-26T08:10:00.000Z");
      const t2 = new Date("2026-11-26T08:15:00.000Z");
      await repo.appendTurns({
        chatId: "chat-A",
        createdAt: t1,
        expiresAt: new Date(t1.getTime() + ttl),
        turns: [
          { role: "user", text: "turn-2-u", sourceMessageKey: "tg:1:m2" },
          { role: "assistant", text: "turn-2-a", sourceMessageKey: "tg:1:m2" }
        ]
      });
      await repo.appendTurns({
        chatId: "chat-A",
        createdAt: t2,
        expiresAt: new Date(t2.getTime() + ttl),
        turns: [
          { role: "user", text: "turn-3-u", sourceMessageKey: "tg:1:m3" },
          { role: "assistant", text: "turn-3-a", sourceMessageKey: "tg:1:m3" }
        ]
      });

      const cappedA = await repo.listRecentActiveByChatId(
        "chat-A",
        new Date("2026-11-26T08:20:00.000Z"),
        10
      );
      expect(cappedA.map((t) => t.text)).toEqual([
        "turn-2-u",
        "turn-2-a",
        "turn-3-u",
        "turn-3-a"
      ]);

      // Clearing chat-A does not touch chat-B
      await repo.clearByChatId("chat-A");
      expect(
        await repo.listRecentActiveByChatId(
          "chat-A",
          new Date("2026-11-26T08:20:00.000Z"),
          10
        )
      ).toHaveLength(0);
      expect(
        await repo.listRecentActiveByChatId(
          "chat-B",
          new Date("2026-11-26T08:20:00.000Z"),
          10
        )
      ).toHaveLength(1);

      // Expired rows are hidden on read and deleted by purgeExpiredState
      const afterExpiry = new Date("2026-11-26T10:00:00.000Z");
      expect(
        await repo.listRecentActiveByChatId("chat-B", afterExpiry, 10)
      ).toHaveLength(0);
      const removed = purgeExpiredState(database, afterExpiry);
      expect(removed).toBe(1);
    } finally {
      database.close();
    }
  });
});
