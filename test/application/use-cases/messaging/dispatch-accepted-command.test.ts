import { describe, expect, it } from "vitest";

import { DispatchAcceptedCommandUseCase } from "../../../../src/application/use-cases/messaging/dispatch-accepted-command.js";
import type { StoreMessageAttachmentsInput } from "../../../../src/application/use-cases/file-inbox/store-message-attachments.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { CommandRoute } from "../../../../src/application/use-cases/messaging/route-command.js";
import type { ClassifyInboundIntentInput } from "../../../../src/application/use-cases/messaging/classify-inbound-intent.js";
import type { ClassifyPendingChoiceInput } from "../../../../src/application/use-cases/messaging/classify-pending-choice.js";

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
    const pendingClarifications = new FakePendingClarifications();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "ask_clarification",
        question: "What is this?"
      }),
      pendingClarifications,
      now: () => new Date("2026-07-02T20:00:00.000Z")
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
    expect(pendingClarifications.saved).toEqual({
      chatId: "chat-owner",
      actorId: "actor-owner",
      originalText: "photo",
      originalAttachments: [],
      question: "What is this?",
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    });
  });

  it("uses a clarification answer to classify and store the original attachment", async () => {
    const attachmentStore = new FakeAttachmentStore(1);
    const intentClassifier = new RecordingIntentClassifier({
      kind: "store_file",
      summary: "passport scan"
    });
    const pendingClarifications = new FakePendingClarifications();
    pendingClarifications.pending = {
      chatId: "chat-owner",
      actorId: "actor-owner",
      originalText: "sent file",
      originalAttachments: [
        {
          id: "attachment-1",
          providerFileId: "telegram-file-1",
          fileName: "scan.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 123
        }
      ],
      question: "What is this file?",
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    };
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      attachmentStore,
      intentClassifier,
      pendingClarifications,
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "new passport for Alexey"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved 1 attachment(s): passport scan."
    });
    expect(intentClassifier.seenInput).toEqual({
      text: [
        "Previous message: sent file",
        "Assistant asked: What is this file?",
        "User clarification: new passport for Alexey"
      ].join("\n"),
      attachments: [
        {
          id: "attachment-1",
          providerFileId: "telegram-file-1",
          fileName: "scan.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 123
        }
      ]
    });
    expect(attachmentStore.seenInput?.attachments).toEqual([
      {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "scan.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 123
      }
    ]);
    expect(pendingClarifications.deletedChatIds).toEqual(["chat-owner"]);
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

  it("records a family fact from model record_fact intent", async () => {
    const factRecorder = new FakeFamilyFactRecorder();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "record_fact",
        summary: "Max prefers chamomile tea before sleep."
      }),
      familyFactRecorder: factRecorder,
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "remember that Max prefers chamomile tea before sleep"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved family fact: Max prefers chamomile tea before sleep."
    });
    expect(factRecorder.seenInput).toEqual({
      summary: "Max prefers chamomile tea before sleep.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-owner",
      sourceMessageText: "remember that Max prefers chamomile tea before sleep"
    });
  });

  it("falls back to attachment storage when model intent classification fails", async () => {
    const attachmentStore = new FakeAttachmentStore(1);
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      attachmentStore,
      intentClassifier: {
        async execute() {
          throw new Error("model failed");
        }
      }
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
      text: "Saved 1 attachment(s). Model routing is temporarily unavailable, so I could not classify it yet."
    });
    expect(attachmentStore.seenInput?.attachments).toEqual([
      {
        id: "attachment-1",
        providerFileId: "telegram-file-1"
      }
    ]);
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

  it("asks what to do when an attachment filename already exists", async () => {
    const pendingFileDuplicateDecisions =
      new FakePendingFileDuplicateDecisions();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      attachmentStore: new FakeAttachmentStore(0, {
        fileName: "report.pdf"
      }),
      pendingFileDuplicateDecisions,
      now: () => new Date("2026-07-02T20:00:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          attachments: [
            {
              id: "attachment-1",
              providerFileId: "telegram-file-1",
              fileName: "report.pdf"
            }
          ]
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "Файл уже есть: report.pdf.",
        "Что сделать?",
        "- сохранить копию как report (2).pdf",
        "- перезаписать существующий файл",
        "- ничего не делать"
      ].join("\n")
    });
    expect(pendingFileDuplicateDecisions.saved).toEqual({
      chatId: "chat-owner",
      actorId: "actor-owner",
      fileName: "report.pdf",
      suggestedCopyName: "report (2).pdf",
      existingRecordId: "file-existing",
      provider: "telegram",
      receivedAt: new Date("2026-07-02T20:00:00.000Z"),
      sourceAttachment: {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf"
      },
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    });
  });

  it("understands Russian overwrite answer for a pending duplicate file", async () => {
    const pendingFileDuplicateDecisions =
      new FakePendingFileDuplicateDecisions();
    pendingFileDuplicateDecisions.pending = {
      chatId: "chat-owner",
      actorId: "actor-owner",
      fileName: "report.pdf",
      suggestedCopyName: "report (2).pdf",
      existingRecordId: "file-existing",
      provider: "telegram",
      receivedAt: new Date("2026-07-02T20:00:00.000Z"),
      sourceAttachment: {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf"
      },
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    };
    const intentClassifier = new RecordingIntentClassifier({
      kind: "ask_clarification",
      question: "should not be reached"
    });
    const duplicateDecisionResolver = new FakeDuplicateDecisionResolver("overwritten");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier,
      duplicateDecisionResolver,
      pendingFileDuplicateDecisions,
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "перезапиши пож"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Готово: перезаписал report.pdf."
    });
    expect(intentClassifier.seenInput).toBeUndefined();
    expect(duplicateDecisionResolver.seenInput).toEqual({
      decision: "overwrite",
      pending: {
        chatId: "chat-owner",
        actorId: "actor-owner",
        fileName: "report.pdf",
        suggestedCopyName: "report (2).pdf",
        existingRecordId: "file-existing",
        provider: "telegram",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        sourceAttachment: {
          id: "attachment-1",
          providerFileId: "telegram-file-1",
          fileName: "report.pdf"
        },
        createdAt: new Date("2026-07-02T20:00:00.000Z"),
        expiresAt: new Date("2026-07-02T20:30:00.000Z")
      }
    });
    expect(pendingFileDuplicateDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("uses model choice classification when duplicate answer parsing is unclear", async () => {
    const pendingFileDuplicateDecisions =
      new FakePendingFileDuplicateDecisions();
    pendingFileDuplicateDecisions.pending = {
      chatId: "chat-owner",
      actorId: "actor-owner",
      fileName: "report.pdf",
      suggestedCopyName: "report (2).pdf",
      existingRecordId: "file-existing",
      provider: "telegram",
      receivedAt: new Date("2026-07-02T20:00:00.000Z"),
      sourceAttachment: {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf"
      },
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    };
    const intentClassifier = new RecordingIntentClassifier({
      kind: "ask_clarification",
      question: "should not be reached"
    });
    const choiceClassifier = new FakePendingChoiceClassifier("overwrite");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier,
      pendingChoiceClassifier: choiceClassifier,
      duplicateDecisionResolver: new FakeDuplicateDecisionResolver("overwritten"),
      pendingFileDuplicateDecisions,
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "сделай как лучше, старый не нужен"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Готово: перезаписал report.pdf."
    });
    expect(intentClassifier.seenInput).toBeUndefined();
    expect(choiceClassifier.seenInput).toEqual({
      prompt: [
        "Файл уже есть: report.pdf.",
        "Что сделать?",
        "- сохранить копию как report (2).pdf",
        "- перезаписать существующий файл",
        "- ничего не делать"
      ].join("\n"),
      userReply: "сделай как лучше, старый не нужен",
      options: [
        {
          value: "copy",
          label: "сохранить копию",
          description: "Save a second file under the suggested copy name."
        },
        {
          value: "overwrite",
          label: "перезаписать существующий файл",
          description: "Replace the existing file."
        },
        {
          value: "skip",
          label: "ничего не делать",
          description: "Leave the existing file unchanged."
        }
      ]
    });
    expect(pendingFileDuplicateDecisions.deletedChatIds).toEqual(["chat-owner"]);
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
      | { readonly kind: "record_fact"; readonly summary: string }
  ) {}

  async execute(_input: ClassifyInboundIntentInput) {
    return this.intent;
  }
}

class FakeFamilyFactRecorder {
  seenInput:
    | {
        summary: string;
        sourceActorId: string;
        sourceChatId: string;
        sourceMessageText: string;
      }
    | undefined;

  async execute(input: NonNullable<FakeFamilyFactRecorder["seenInput"]>) {
    this.seenInput = input;

    return {
      id: "fact-1",
      category: "preference" as const,
      body: input.summary,
      sourceActorId: input.sourceActorId,
      sourceChatId: input.sourceChatId,
      sourceMessageText: input.sourceMessageText,
      status: "active" as const,
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      updatedAt: new Date("2026-07-07T10:00:00.000Z")
    };
  }
}

class RecordingIntentClassifier extends FakeIntentClassifier {
  seenInput: ClassifyInboundIntentInput | undefined;

  async execute(input: ClassifyInboundIntentInput) {
    this.seenInput = input;

    return super.execute(input);
  }
}

class FakePendingClarifications {
  pending:
    | {
        chatId: string;
        actorId: string;
        originalText: string;
        originalAttachments: AcceptedMessageContext["attachments"];
        question: string;
        createdAt: Date;
        expiresAt: Date;
      }
    | undefined;
  saved: FakePendingClarifications["pending"];
  readonly deletedChatIds: string[] = [];

  async findActiveByChatId(chatId: string, now: Date) {
    if (
      this.pending?.chatId === chatId &&
      this.pending.expiresAt.getTime() > now.getTime()
    ) {
      return this.pending;
    }

    return undefined;
  }

  async save(input: NonNullable<FakePendingClarifications["pending"]>) {
    this.saved = input;
    this.pending = input;
  }

  async clearByChatId(chatId: string) {
    this.deletedChatIds.push(chatId);
    this.pending = undefined;
  }
}

class FakePendingFileDuplicateDecisions {
  pending:
    | {
        chatId: string;
        actorId: string;
        fileName: string;
        suggestedCopyName: string;
        existingRecordId: string;
        provider?: string;
        receivedAt?: Date;
        sourceAttachment?: AcceptedMessageContext["attachments"][number];
        createdAt: Date;
        expiresAt: Date;
      }
    | undefined;
  saved: FakePendingFileDuplicateDecisions["pending"];
  readonly deletedChatIds: string[] = [];

  async findActiveByChatId(chatId: string, now: Date) {
    if (
      this.pending?.chatId === chatId &&
      this.pending.expiresAt.getTime() > now.getTime()
    ) {
      return this.pending;
    }

    return undefined;
  }

  async save(input: NonNullable<FakePendingFileDuplicateDecisions["pending"]>) {
    this.saved = input;
    this.pending = input;
  }

  async clearByChatId(chatId: string) {
    this.deletedChatIds.push(chatId);
    this.pending = undefined;
  }
}

class FakeDuplicateDecisionResolver {
  seenInput:
    | {
        decision: "copy" | "overwrite";
        pending: NonNullable<FakePendingFileDuplicateDecisions["pending"]> | undefined;
      }
    | undefined;

  constructor(private readonly status: "copied" | "overwritten" | "unavailable") {}

  async execute(input: {
    decision: "copy" | "overwrite";
    pending: NonNullable<FakePendingFileDuplicateDecisions["pending"]>;
  }) {
    this.seenInput = input;

    if (this.status === "unavailable") {
      return { status: "unavailable" as const, reason: "missing_source_attachment" as const };
    }

    return {
      status: this.status,
      record: {
        id: input.pending.existingRecordId,
        originalFileName:
          input.decision === "copy"
            ? input.pending.suggestedCopyName
            : input.pending.fileName,
        sizeBytes: 3,
        storageId: "storage-new",
        storagePath: "/tmp/report.pdf",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        createdAt: new Date("2026-07-02T20:00:00.000Z")
      }
    };
  }
}

class FakePendingChoiceClassifier {
  seenInput: ClassifyPendingChoiceInput | undefined;

  constructor(private readonly choice: "copy" | "overwrite" | "skip" | undefined) {}

  async execute(input: ClassifyPendingChoiceInput) {
    this.seenInput = input;

    return this.choice;
  }
}

class FakeAttachmentStore {
  seenInput: StoreMessageAttachmentsInput | undefined;

  constructor(
    private readonly storedCount: number,
    private readonly duplicate?: { readonly fileName: string }
  ) {}

  async execute(
    input: StoreMessageAttachmentsInput
  ): Promise<
    readonly (
      | { readonly status: "stored"; readonly record: FileInboxRecord }
      | {
          readonly status: "duplicate";
          readonly fileName: string;
          readonly existingRecord: FileInboxRecord;
        }
    )[]
  > {
    this.seenInput = input;

    if (this.duplicate) {
      return [
        {
          status: "duplicate",
          fileName: this.duplicate.fileName,
          existingRecord: {
            id: "file-existing",
            originalFileName: this.duplicate.fileName,
            sizeBytes: 10,
            storageId: "storage-existing",
            storagePath: `/tmp/${this.duplicate.fileName}`,
            receivedAt: new Date("2026-07-02T19:00:00.000Z"),
            createdAt: new Date("2026-07-02T19:00:00.000Z")
          }
        }
      ];
    }

    return Array.from({ length: this.storedCount }, (_, index) => ({
      status: "stored" as const,
      record: {
        id: `file-${index + 1}`,
        originalFileName: `file-${index + 1}.txt`,
        sizeBytes: 10,
        storageId: `storage-${index + 1}`,
        storagePath: `/tmp/file-${index + 1}.txt`,
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        createdAt: new Date("2026-07-02T20:00:00.000Z")
      }
    }));
  }
}
