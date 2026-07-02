import { describe, expect, it } from "vitest";

import type { AdminSession } from "../../../../src/core/domain/identity/admin-session.js";
import type { Actor } from "../../../../src/core/domain/identity/actor.js";
import type { ActorIdentity } from "../../../../src/core/domain/identity/actor-identity.js";
import type { ChatContext } from "../../../../src/core/domain/identity/chat-context.js";
import type { MessengerChat } from "../../../../src/core/domain/identity/messenger-chat.js";
import { ActivateAdminSessionUseCase } from "../../../../src/application/use-cases/identity/activate-admin-session.js";
import { RefreshAdminSessionUseCase } from "../../../../src/application/use-cases/identity/refresh-admin-session.js";
import { ResolveIdentityContextUseCase } from "../../../../src/application/use-cases/identity/resolve-identity-context.js";
import { ReviewPendingIdentityUseCase } from "../../../../src/application/use-cases/identity/review-pending-identity.js";
import type { AdminSecretVerifierPort } from "../../../../src/ports/admin-secret-verifier-port.js";
import type { IdentityAccessRepositoryPort } from "../../../../src/ports/identity-access-repository-port.js";

describe("identity access application use cases", () => {
  it("resolves unknown provider identity and chat into pending records", async () => {
    const repository = new FakeIdentityAccessRepository();
    const useCase = new ResolveIdentityContextUseCase({
      repository,
      generateId: nextIds([
        "actor-1",
        "identity-1",
        "chat-1"
      ])
    });

    const result = await useCase.execute({
      provider: "telegram",
      providerUserId: "tg-user-1",
      providerChatId: "tg-chat-1",
      chatKind: "family_private",
      displayName: "Pending Person"
    });

    expect(result).toEqual({
      actor: {
        id: "actor-1",
        displayName: "Pending Person",
        role: "family",
        status: "pending"
      },
      chat: {
        id: "chat-1",
        kind: "family_private",
        approved: false
      },
      createdActor: true,
      createdChat: true
    });
    expect(repository.identities).toEqual([
      {
        id: "identity-1",
        actorId: "actor-1",
        provider: "telegram",
        providerUserId: "tg-user-1",
        status: "pending"
      }
    ]);
  });

  it("resolves existing provider identity and chat without duplicates", async () => {
    const repository = new FakeIdentityAccessRepository();
    await seedOwner(repository);

    const useCase = new ResolveIdentityContextUseCase({
      repository,
      generateId: nextIds(["unused"])
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        chatKind: "owner_private",
        displayName: "Ignored"
      })
    ).resolves.toEqual({
      actor: owner,
      chat: ownerPrivateChat,
      createdActor: false,
      createdChat: false
    });
    expect(repository.actors).toHaveLength(1);
    expect(repository.chats).toHaveLength(1);
  });

  it("approves and rejects pending identities", async () => {
    const repository = new FakeIdentityAccessRepository();
    repository.actors.push({
      id: "actor-pending",
      displayName: "Pending",
      role: "family",
      status: "pending"
    });
    repository.identities.push({
      id: "identity-pending",
      actorId: "actor-pending",
      provider: "telegram",
      providerUserId: "tg-pending",
      status: "pending"
    });

    const useCase = new ReviewPendingIdentityUseCase({ repository });

    await expect(
      useCase.execute({
        actorId: "actor-pending",
        identityId: "identity-pending",
        decision: "approve"
      })
    ).resolves.toEqual({
      actorStatus: "active",
      identityStatus: "active"
    });

    await expect(
      useCase.execute({
        actorId: "actor-pending",
        identityId: "identity-pending",
        decision: "reject"
      })
    ).resolves.toEqual({
      actorStatus: "blocked",
      identityStatus: "blocked"
    });
  });

  it("activates admin session only after policy and secret verification pass", async () => {
    const repository = new FakeIdentityAccessRepository();
    const verifier = new FakeAdminSecretVerifier("1234");
    const useCase = new ActivateAdminSessionUseCase({
      repository,
      verifier,
      generateId: nextIds(["admin-session-1"]),
      ttlMs: 5 * 60 * 1000
    });

    await expect(
      useCase.execute({
        actor: owner,
        chat: ownerPrivateChat,
        secret: "bad",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).resolves.toEqual({
      activated: false,
      reason: "invalid_secret"
    });

    await expect(
      useCase.execute({
        actor: owner,
        chat: ownerPrivateChat,
        secret: "1234",
        now: new Date("2026-07-02T20:00:00.000Z")
      })
    ).resolves.toEqual({
      activated: true,
      session: {
        id: "admin-session-1",
        actorId: owner.id,
        chatId: ownerPrivateChat.id,
        lastActivityAt: new Date("2026-07-02T20:00:00.000Z"),
        expiresAt: new Date("2026-07-02T20:05:00.000Z")
      }
    });
    expect(verifier.seenSecrets).toEqual(["bad", "1234"]);
    expect(repository.sessions).toHaveLength(1);
  });

  it("refreshes an active matching admin session", async () => {
    const repository = new FakeIdentityAccessRepository();
    const session: AdminSession = {
      id: "admin-session-1",
      actorId: owner.id,
      chatId: ownerPrivateChat.id,
      lastActivityAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:05:00.000Z")
    };
    repository.sessions.push(session);

    const useCase = new RefreshAdminSessionUseCase({
      repository,
      ttlMs: 5 * 60 * 1000
    });

    await expect(
      useCase.execute({
        sessionId: session.id,
        actor: owner,
        chat: ownerPrivateChat,
        now: new Date("2026-07-02T20:03:00.000Z")
      })
    ).resolves.toEqual({
      refreshed: true,
      session: {
        ...session,
        lastActivityAt: new Date("2026-07-02T20:03:00.000Z"),
        expiresAt: new Date("2026-07-02T20:08:00.000Z")
      }
    });
  });
});

const owner: Actor = {
  id: "actor-owner",
  displayName: "Owner",
  role: "owner",
  status: "active"
};

const ownerPrivateChat: ChatContext = {
  id: "chat-owner",
  kind: "owner_private",
  approved: true
};

async function seedOwner(repository: FakeIdentityAccessRepository): Promise<void> {
  await repository.createActor(owner);
  await repository.createActorIdentity({
    id: "identity-owner",
    actorId: owner.id,
    provider: "telegram",
    providerUserId: "tg-owner",
    status: "active"
  });
  await repository.createMessengerChat({
    id: ownerPrivateChat.id,
    provider: "telegram",
    providerChatId: "tg-owner-chat",
    kind: ownerPrivateChat.kind,
    approved: ownerPrivateChat.approved
  });
}

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

class FakeAdminSecretVerifier implements AdminSecretVerifierPort {
  readonly seenSecrets: string[] = [];

  constructor(private readonly validSecret: string) {}

  async verifyAdminSecret(secret: string): Promise<boolean> {
    this.seenSecrets.push(secret);

    return secret === this.validSecret;
  }
}

class FakeIdentityAccessRepository implements IdentityAccessRepositoryPort {
  readonly actors: Actor[] = [];
  readonly identities: ActorIdentity[] = [];
  readonly chats: MessengerChat[] = [];
  readonly sessions: AdminSession[] = [];

  async createActor(actor: Actor): Promise<Actor> {
    this.actors.push(actor);

    return actor;
  }

  async createActorIdentity(identity: ActorIdentity): Promise<ActorIdentity> {
    this.identities.push(identity);

    return identity;
  }

  async createMessengerChat(chat: MessengerChat): Promise<MessengerChat> {
    this.chats.push(chat);

    return chat;
  }

  async saveAdminSession(session: AdminSession): Promise<AdminSession> {
    const index = this.sessions.findIndex((candidate) => candidate.id === session.id);

    if (index >= 0) {
      this.sessions[index] = session;
    } else {
      this.sessions.push(session);
    }

    return session;
  }

  async findActorByIdentity(
    provider: string,
    providerUserId: string
  ): Promise<Actor | undefined> {
    const identity = this.identities.find(
      (candidate) =>
        candidate.provider === provider &&
        candidate.providerUserId === providerUserId
    );

    return identity
      ? this.actors.find((actor) => actor.id === identity.actorId)
      : undefined;
  }

  async findChatByProviderChatId(
    provider: string,
    providerChatId: string
  ): Promise<ChatContext | undefined> {
    const chat = this.chats.find(
      (candidate) =>
        candidate.provider === provider &&
        candidate.providerChatId === providerChatId
    );

    return chat
      ? {
          id: chat.id,
          kind: chat.kind,
          approved: chat.approved
        }
      : undefined;
  }

  async findAdminSession(id: string): Promise<AdminSession | undefined> {
    return this.sessions.find((session) => session.id === id);
  }

  async updateActorStatus(
    actorId: string,
    status: Actor["status"]
  ): Promise<void> {
    const actor = this.actors.find((candidate) => candidate.id === actorId);

    if (!actor) {
      throw new Error(`Actor not found: ${actorId}`);
    }

    this.actors[this.actors.indexOf(actor)] = { ...actor, status };
  }

  async updateActorIdentityStatus(
    identityId: string,
    status: ActorIdentity["status"]
  ): Promise<void> {
    const identity = this.identities.find(
      (candidate) => candidate.id === identityId
    );

    if (!identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    this.identities[this.identities.indexOf(identity)] = {
      ...identity,
      status
    };
  }
}
