import { describe, expect, it } from "vitest";

import { createAdminSession } from "../../../src/core/domain/identity/admin-session.js";
import { BootstrapOwnerIdentityUseCase } from "../../../src/application/use-cases/identity/bootstrap-owner-identity.js";
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

    await repository.updateActorStatus(actor.id, "blocked");
    await repository.updateActorIdentityStatus("identity-owner", "blocked");
    await repository.updateMessengerChatApproval("chat-owner", false);

    await expect(
      repository.findActorByIdentity("telegram", "tg-user-1")
    ).resolves.toEqual({
      ...actor,
      status: "blocked"
    });
    await expect(
      repository.findChatByProviderChatId("telegram", "tg-chat-1")
    ).resolves.toEqual({
      id: "chat-owner",
      kind: "owner_private",
      approved: false
    });

    await repository.saveAdminSession({
      ...adminSession,
      lastActivityAt: new Date("2026-07-02T20:03:00.000Z"),
      expiresAt: new Date("2026-07-02T20:08:00.000Z")
    });

    await expect(
      repository.findAdminSession("admin-session-1")
    ).resolves.toEqual({
      ...adminSession,
      lastActivityAt: new Date("2026-07-02T20:03:00.000Z"),
      expiresAt: new Date("2026-07-02T20:08:00.000Z")
    });

    database.close();
  });

  it("lists and finds pending personal access requests", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteIdentityAccessRepository(database);

    const actor = await repository.createActor({
      id: "actor-pending",
      displayName: "Pending Person",
      role: "family",
      status: "pending"
    });
    await repository.createActorIdentity({
      id: "identity-pending",
      actorId: actor.id,
      provider: "telegram",
      providerUserId: "tg-pending",
      status: "pending"
    });
    await repository.createMessengerChat({
      id: "chat-pending",
      provider: "telegram",
      providerChatId: "tg-pending",
      kind: "family_private",
      approved: false
    });

    const expected = {
      actor,
      identity: {
        id: "identity-pending",
        provider: "telegram",
        providerUserId: "tg-pending",
        status: "pending" as const
      },
      chat: {
        id: "chat-pending",
        provider: "telegram",
        providerChatId: "tg-pending",
        kind: "family_private" as const,
        approved: false
      }
    };

    await expect(repository.listPendingAccessRequests()).resolves.toEqual([
      expected
    ]);
    await expect(
      repository.findPendingAccessRequestByActorId("actor-pending")
    ).resolves.toEqual(expected);

    database.close();
  });

  it("supports idempotent owner bootstrap", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteIdentityAccessRepository(database);
    const bootstrap = new BootstrapOwnerIdentityUseCase({
      repository,
      generateId: nextIds(["actor-owner", "identity-owner", "chat-owner"])
    });

    await bootstrap.execute({
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner-chat",
      displayName: "Owner"
    });
    await expect(
      bootstrap.execute({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      })
    ).resolves.toMatchObject({
      createdActor: false,
      createdIdentity: false,
      createdChat: false
    });

    await expect(
      repository.findActorByIdentity("telegram", "tg-owner")
    ).resolves.toMatchObject({
      role: "owner",
      status: "active"
    });
    await expect(
      repository.findChatByProviderChatId("telegram", "tg-owner-chat")
    ).resolves.toEqual({
      id: "chat-owner",
      kind: "owner_private",
      approved: true
    });

    database.close();
  });
});

function nextIds(ids: readonly string[]): () => string {
  let index = 0;

  return () => {
    const id = ids[index];
    index += 1;

    if (!id) {
      throw new Error("No test ID available");
    }

    return id;
  };
}
