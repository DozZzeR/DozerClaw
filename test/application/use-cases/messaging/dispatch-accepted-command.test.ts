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

function route(kind: CommandRoute["kind"]): CommandRoute {
  return {
    kind,
    action: kind === "family_message" ? "family_read" : "owner_read",
    normalizedText: kind
  };
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
