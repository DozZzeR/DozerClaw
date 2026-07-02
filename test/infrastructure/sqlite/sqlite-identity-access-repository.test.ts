import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../../src/core/domain/identity/admin-session.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteIdentityAccessRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-identity-access-repository.js";

describe("SqliteIdentityAccessRepository", () => {
  it("creates and resolves actors, identities, chats, and admin sessions", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteIdentityAccessRepository(database);

    const actor = await repository.createActor({
      id: "actor-owner",
      displayName: "Owner",
      role: "owner",
      status: "active"
    });

    await repository.createActorIdentity({
      id: "identity-owner",
      actorId: actor.id,
      provider: "telegram",
      providerUserId: "tg-user-1",
      status: "active"
    });

    await repository.createMessengerChat({
      id: "chat-owner",
      provider: "telegram",
      providerChatId: "tg-chat-1",
      kind: "owner_private",
      approved: true
    });

    const adminSession = createAdminSession({
      id: "admin-session-1",
      actorId: actor.id,
      chatId: "chat-owner",
      now: new Date("2026-07-02T20:00:00.000Z"),
      ttlMs: 5 * 60 * 1000
    });

    await repository.saveAdminSession(adminSession);

    await expect(
      repository.findActorByIdentity("telegram", "tg-user-1")
    ).resolves.toEqual(actor);
    await expect(
      repository.findChatByProviderChatId("telegram", "tg-chat-1")
    ).resolves.toEqual({
      id: "chat-owner",
      kind: "owner_private",
      approved: true
    });
    await expect(
      repository.findAdminSession("admin-session-1")
    ).resolves.toEqual(adminSession);

    database.close();
  });
});
