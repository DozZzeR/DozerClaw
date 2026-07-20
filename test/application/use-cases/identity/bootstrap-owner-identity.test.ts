import { describe, expect, it } from "vitest";

import { BootstrapOwnerIdentityUseCase } from "../../../../src/application/use-cases/identity/bootstrap-owner-identity.js";
import type { AdminSession } from "../../../../src/core/domain/identity/admin-session.js";
import type { Actor, ActorStatus } from "../../../../src/core/domain/identity/actor.js";
import type { ActorIdentity } from "../../../../src/core/domain/identity/actor-identity.js";
import type { ChatContext } from "../../../../src/core/domain/identity/chat-context.js";
import type { MessengerChat } from "../../../../src/core/domain/identity/messenger-chat.js";
import type { IdentityAccessRepositoryPort } from "../../../../src/ports/identity-access-repository-port.js";

describe("BootstrapOwnerIdentityUseCase", () => {
  it("creates active owner identity and approved owner private chat when missing", async () => {
    const repository = new FakeIdentityAccessRepository();
    const useCase = new BootstrapOwnerIdentityUseCase({
      repository,
      generateId: nextIds(["actor-owner", "identity-owner", "chat-owner"])
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      })
    ).resolves.toEqual({
      actor: {
        id: "actor-owner",
        displayName: "Owner",
        role: "owner",
        status: "active"
      },
      chat: {
        id: "chat-owner",
        kind: "owner_private",
        approved: true
      },
      createdActor: true,
      createdIdentity: true,
      createdChat: true
    });
  });

  it("does not duplicate existing owner identity and chat", async () => {
    const repository = new FakeIdentityAccessRepository();
    repository.actors.push(owner);
    repository.identities.push({
      id: "identity-owner",
      actorId: owner.id,
      provider: "telegram",
      providerUserId: "tg-owner",
      status: "active"
    });
    repository.chats.push({
      id: ownerChat.id,
      provider: "telegram",
      providerChatId: "tg-owner-chat",
      kind: ownerChat.kind,
      approved: ownerChat.approved
    });
    const useCase = new BootstrapOwnerIdentityUseCase({
      repository,
      generateId: nextIds(["unused"])
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        providerUserId: "tg-owner",
        providerChatId: "tg-owner-chat",
        displayName: "Owner"
      })
    ).resolves.toEqual({
      actor: owner,
      chat: ownerChat,
      createdActor: false,
      createdIdentity: false,
      createdChat: false
    });
    expect(repository.actors).toHaveLength(1);
    expect(repository.identities).toHaveLength(1);
    expect(repository.chats).toHaveLength(1);
  });
});

const owner: Actor = {
  id: "actor-owner",
  displayName: "Owner",
  role: "owner",
  status: "active"
};

const ownerChat: ChatContext = {
  id: "chat-owner",
  kind: "owner_private",
  approved: true
};

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

class FakeIdentityAccessRepository implements IdentityAccessRepositoryPort {
  readonly actors: Actor[] = [];
  readonly identities: ActorIdentity[] = [];
  readonly chats: MessengerChat[] = [];

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
    return session;
  }

  async updateActorStatus(
    actorId: string,
    status: ActorStatus
  ): Promise<void> {
    this.actors.splice(
      this.actors.findIndex((actor) => actor.id === actorId),
      1,
      {
        ...this.actors.find((actor) => actor.id === actorId)!,
        status
      }
    );
  }

  async updateActorIdentityStatus(
    identityId: string,
    status: ActorStatus
  ): Promise<void> {
    this.identities.splice(
      this.identities.findIndex((identity) => identity.id === identityId),
      1,
      {
        ...this.identities.find((identity) => identity.id === identityId)!,
        status
      }
    );
  }

  async updateMessengerChatApproval(): Promise<void> {}

  async listPendingAccessRequests() {
    return [];
  }

  async findPendingAccessRequestByActorId() {
    return undefined;
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

  async findAdminSession(): Promise<AdminSession | undefined> {
    return undefined;
  }

  async findActiveAdminSessionByActorAndChat(): Promise<AdminSession | undefined> {
    return undefined;
  }
}
