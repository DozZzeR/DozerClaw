import { describe, expect, it } from "vitest";

import { handlePendingFileDuplicateDestination } from "../../../../src/application/use-cases/messaging/pending-handlers/file-duplicate-destination-handler.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { PendingFileDuplicateDecision } from "../../../../src/ports/state-repository-port.js";

const context: AcceptedMessageContext = {
  provider: "telegram",
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
  text: "local inbox",
  attachments: [],
  action: "family_read",
  receivedAt: new Date("2026-09-07T10:00:00.000Z")
};

const pending: PendingFileDuplicateDecision = {
  chatId: "chat-owner",
  actorId: "actor-owner",
  fileName: "report.pdf",
  suggestedCopyName: "report (1).pdf",
  existingRecordId: "rec-1",
  provider: "telegram",
  receivedAt: new Date("2026-09-07T09:55:00.000Z"),
  sourceAttachment: {
    id: "att-1",
    providerFileId: "file-1",
    fileName: "report.pdf",
    mimeType: "application/pdf"
  },
  createdAt: new Date("2026-09-07T09:55:00.000Z"),
  expiresAt: new Date("2026-09-07T10:25:00.000Z")
};

describe("handlePendingFileDuplicateDestination", () => {
  it("keeps the pending duplicate decision intact and reprompts when user selects local_inbox", async () => {
    let cleared = false;
    let storeCalled = false;

    const reply = await handlePendingFileDuplicateDestination(
      context,
      pending,
      "local_inbox",
      {
        async storeAttachments() {
          storeCalled = true;
          return { chatId: context.chat.id, text: "unexpected" };
        },
        async savePlacementSuggestion() {
          return false;
        },
        async clearPending() {
          cleared = true;
        }
      }
    );

    expect(cleared).toBe(false);
    expect(storeCalled).toBe(false);
    expect(reply.chatId).toBe("chat-owner");
    expect(reply.text).toContain("Файл уже есть: report.pdf.");
    expect(reply.text).toContain("report (1).pdf");
  });
});
