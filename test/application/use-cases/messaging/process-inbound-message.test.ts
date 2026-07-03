import { describe, expect, it } from "vitest";

import type { AdminSession } from "../../../../src/core/domain/identity/admin-session.js";
import type { Actor } from "../../../../src/core/domain/identity/actor.js";
import type { ChatContext } from "../../../../src/core/domain/identity/chat-context.js";
import { ProcessInboundMessageUseCase } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { IdentityAccessRepositoryPort } from "../../../../src/ports/identity-access-repository-port.js";
import type { ResolveIdentityContextResult } from "../../../../src/application/use-cases/identity/resolve-identity-context.js";

describe("ProcessInboundMessageUseCase", () => {
  it("returns pending approval for new or unapproved identity context", async () => {
    const useCase = new ProcessInboundMessageUseCase({
      identityContextResolver: new FakeIdentityContextResolver({
        actor: pendingFamily,
        chat: unapprovedFamilyChat,
        createdActor: true,
        createdChat: true
      }),
      identityRepository: new FakeIdentityRepository()
    });

    await expect(
      useCase.execute(baseRequest({ action: "family_read" }))
    ).resolves.toEqual({
      status: "pending_approval",
      reply: {
        chatId: "chat-family",
        text: "Access request is pending owner approval."
      }
    });
  });

  it("accepts allowed family request", async () => {
    const useCase = new ProcessInboundMessageUseCase({
      identityContextResolver: new FakeIdentityContextResolver({
        actor: activeFamily,
        chat: approvedFamilyChat,
        createdActor: false,
        createdChat: false
      }),
      identityRepository: new FakeIdentityRepository()
    });

    await expect(
      useCase.execute(baseRequest({ action: "family_read", text: "hello" }))
    ).resolves.toEqual({
      status: "accepted",
      context: {
        actor: activeFamily,
        chat: approvedFamilyChat,
        action: "family_read",
        text: "hello",
        attachments: []
      }
    });
  });

  it("preserves attachments in accepted context", async () => {
    const useCase = new ProcessInboundMessageUseCase({
      identityContextResolver: new FakeIdentityContextResolver({
        actor: activeFamily,
        chat: approvedFamilyChat,
        createdActor: false,
        createdChat: false
      }),
      identityRepository: new FakeIdentityRepository()
    });

    await expect(
      useCase.execute(
        baseRequest({
          action: "family_read",
          attachments: [
            {
              id: "attachment-1",
              providerFileId: "telegram-file-1",
              fileName: "report.pdf",
              mimeType: "application/pdf",
              sizeBytes: 123
            }
          ]
        })
      )
    ).resolves.toEqual({
      status: "accepted",
      context: {
        actor: activeFamily,
        chat: approvedFamilyChat,
        action: "family_read",
        text: "/restart service",
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            sizeBytes: 123
          }
        ]
      }
    });
  });

  it("returns denied result when access policy rejects the request", async () => {
    const useCase = new ProcessInboundMessageUseCase({
      identityContextResolver: new FakeIdentityContextResolver({
        actor: activeFamily,
        chat: approvedFamilyChat,
        createdActor: false,
        createdChat: false
      }),
      identityRepository: new FakeIdentityRepository()
    });

    await expect(
      useCase.execute(baseRequest({ action: "owner_read" }))
    ).resolves.toEqual({
      status: "denied",
      reason: "owner_required",
      reply: {
        chatId: "chat-family",
        text: "Access denied: owner_required."
      }
    });
  });

  it("loads admin session and accepts matching active admin request", async () => {
    const repository = new FakeIdentityRepository();
    repository.session = {
      id: "admin-session-1",
      actorId: owner.id,
      chatId: ownerPrivateChat.id,
      lastActivityAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:05:00.000Z")
    };
    const useCase = new ProcessInboundMessageUseCase({
      identityContextResolver: new FakeIdentityContextResolver({
        actor: owner,
        chat: ownerPrivateChat,
        createdActor: false,
        createdChat: false
      }),
      identityRepository: repository
    });

    await expect(
      useCase.execute(
        baseRequest({
          action: "admin_write",
          adminSessionId: "admin-session-1",
          now: new Date("2026-07-02T20:01:00.000Z")
        })
      )
    ).resolves.toEqual({
      status: "accepted",
      context: {
        actor: owner,
        chat: ownerPrivateChat,
        action: "admin_write",
        text: "/restart service",
        attachments: [],
        adminSession: repository.session
      }
    });
  });
});

const activeFamily: Actor = {
  id: "actor-family",
  displayName: "Family",
  role: "family",
  status: "active"
};

const pendingFamily: Actor = {
  ...activeFamily,
  status: "pending"
};

const owner: Actor = {
  id: "actor-owner",
  displayName: "Owner",
  role: "owner",
  status: "active"
};

const approvedFamilyChat: ChatContext = {
  id: "chat-family",
  kind: "family_private",
  approved: true
};

const unapprovedFamilyChat: ChatContext = {
  ...approvedFamilyChat,
  approved: false
};

const ownerPrivateChat: ChatContext = {
  id: "chat-owner",
  kind: "owner_private",
  approved: true
};

function baseRequest(
  overrides: Partial<Parameters<ProcessInboundMessageUseCase["execute"]>[0]> = {}
): Parameters<ProcessInboundMessageUseCase["execute"]>[0] {
  return {
    messageId: "message-1",
    provider: "telegram",
    providerUserId: "tg-user-1",
    providerChatId: "tg-chat-1",
    chatKind: "family_private",
    displayName: "Family",
    text: "/restart service",
    attachments: [],
    action: "family_read",
    receivedAt: new Date("2026-07-02T20:00:00.000Z"),
    now: new Date("2026-07-02T20:00:00.000Z"),
    ...overrides
  };
}

class FakeIdentityContextResolver {
  constructor(private readonly result: ResolveIdentityContextResult) {}

  async execute(): Promise<ResolveIdentityContextResult> {
    return this.result;
  }
}

class FakeIdentityRepository
  implements Pick<IdentityAccessRepositoryPort, "findAdminSession">
{
  session: AdminSession | undefined;

  async findAdminSession(id: string): Promise<AdminSession | undefined> {
    return this.session?.id === id ? this.session : undefined;
  }
}
