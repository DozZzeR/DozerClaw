import { describe, expect, it } from "vitest";

import { DispatchAcceptedCommandUseCase } from "../../../../src/application/use-cases/messaging/dispatch-accepted-command.js";
import type { StoreMessageAttachmentsInput } from "../../../../src/application/use-cases/file-inbox/store-message-attachments.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { CommandRoute } from "../../../../src/application/use-cases/messaging/route-command.js";

describe("DispatchAcceptedCommandUseCase", () => {
  it("dispatches system health command to handler", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: {
        async execute(input) {
          return {
            chatId: input.chatId,
            text: "System health reply"
          };
        }
      }
    });

    await expect(
      useCase.execute({
        route: route("system_health"),
        context: acceptedContext
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "System health reply"
    });
  });

  it("returns not implemented reply for unsupported command kinds", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: {
        async execute() {
          throw new Error("should not be called");
        }
      }
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "remember tea"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Command not implemented yet: family_message."
    });
  });

  it("stores family message attachments when an attachment store is configured", async () => {
    const attachmentStore = new FakeAttachmentStore(1);
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: {
        async execute() {
          throw new Error("should not be called");
        }
      },
      attachmentStore
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "receipt",
          attachments: [
            {
              id: "attachment-1",
              providerFileId: "telegram-file-1",
              fileName: "receipt.jpg",
              mimeType: "image/jpeg",
              sizeBytes: 1234
            }
          ]
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved 1 attachment(s)."
    });
    expect(attachmentStore.seenInput).toEqual({
      provider: "telegram",
      receivedAt: new Date("2026-07-02T20:00:00.000Z"),
      attachments: [
        {
          id: "attachment-1",
          providerFileId: "telegram-file-1",
          fileName: "receipt.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1234
        }
      ]
    });
  });

  it("uses model intent classifier for family clarification", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "ask_clarification",
        question: "What is this?"
      })
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "photo"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "What is this?"
    });
  });

  it("uses model store_file intent with existing attachment storage", async () => {
    const attachmentStore = new FakeAttachmentStore(1);
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      attachmentStore,
      intentClassifier: new FakeIntentClassifier({
        kind: "store_file",
        summary: "passport scan"
      })
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          attachments: [
            {
              id: "attachment-1",
              providerFileId: "telegram-file-1"
            }
          ]
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved 1 attachment(s): passport scan."
    });
  });

  it("reports when family message attachments have no downloadable files", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: {
        async execute() {
          throw new Error("should not be called");
        }
      },
      attachmentStore: new FakeAttachmentStore(0)
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          attachments: [
            {
              id: "attachment-1"
            }
          ]
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "No downloadable attachments found."
    });
  });

  it("lists pending access requests for owner review", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      pendingAccessRequests: new FakePendingAccessRequests()
    });

    await expect(
      useCase.execute({
        route: route("pending_access_requests", "/pending"),
        context: acceptedContext
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "Pending access requests:",
        "- actor-pending: Pending Person (telegram user tg-pending, chat tg-pending, family_private)",
        "Approve: /approve actor-pending",
        "Reject: /reject actor-pending"
      ].join("\n")
    });
  });

  it("approves and rejects pending access requests", async () => {
    const pendingAccessRequests = new FakePendingAccessRequests();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      pendingAccessRequests
    });

    await expect(
      useCase.execute({
        route: route("approve_access_request", "/approve actor-pending"),
        context: acceptedContext
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Approved access request for actor-pending."
    });
    await expect(
      useCase.execute({
        route: route("reject_access_request", "/reject actor-pending"),
        context: acceptedContext
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Rejected access request for actor-pending."
    });
    expect(pendingAccessRequests.decisions).toEqual([
      { actorId: "actor-pending", decision: "approve" },
      { actorId: "actor-pending", decision: "reject" }
    ]);
  });
});

const acceptedContext: AcceptedMessageContext = {
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
  action: "owner_read",
  provider: "telegram",
  receivedAt: new Date("2026-07-02T20:00:00.000Z"),
  text: "health",
  attachments: []
};

const unusedHealthHandler = {
  async execute() {
    throw new Error("should not be called");
  }
};

function route(
  kind: CommandRoute["kind"],
  normalizedText: string = kind
): CommandRoute {
  return {
    kind,
    action:
      kind === "family_message" || kind === "start"
        ? "family_read"
        : "owner_read",
    normalizedText
  };
}

class FakePendingAccessRequests {
  readonly decisions: { actorId: string; decision: "approve" | "reject" }[] = [];

  async list() {
    return [
      {
        actor: {
          id: "actor-pending",
          displayName: "Pending Person",
          role: "family" as const,
          status: "pending" as const
        },
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
      }
    ];
  }

  async review(input: { actorId: string; decision: "approve" | "reject" }) {
    this.decisions.push(input);

    return {
      reviewed: true as const,
      actorStatus:
        input.decision === "approve" ? ("active" as const) : ("blocked" as const),
      identityStatus:
        input.decision === "approve" ? ("active" as const) : ("blocked" as const),
      chatApproved: input.decision === "approve"
    };
  }
}

class FakeIntentClassifier {
  constructor(
    private readonly intent:
      | { readonly kind: "ask_clarification"; readonly question: string }
      | { readonly kind: "store_file"; readonly summary?: string }
  ) {}

  async execute() {
    return this.intent;
  }
}

class FakeAttachmentStore {
  seenInput: StoreMessageAttachmentsInput | undefined;

  constructor(private readonly storedCount: number) {}

  async execute(
    input: StoreMessageAttachmentsInput
  ): Promise<readonly FileInboxRecord[]> {
    this.seenInput = input;

    return Array.from({ length: this.storedCount }, (_, index) => ({
      id: `file-${index + 1}`,
      originalFileName: `file-${index + 1}.txt`,
      sizeBytes: 10,
      storageId: `storage-${index + 1}`,
      storagePath: `/tmp/file-${index + 1}.txt`,
      receivedAt: new Date("2026-07-02T20:00:00.000Z"),
      createdAt: new Date("2026-07-02T20:00:00.000Z")
    }));
  }
}
