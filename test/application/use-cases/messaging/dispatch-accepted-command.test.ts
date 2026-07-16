import { describe, expect, it } from "vitest";

import { DispatchAcceptedCommandUseCase } from "../../../../src/application/use-cases/messaging/dispatch-accepted-command.js";
import type { StoreMessageAttachmentsInput } from "../../../../src/application/use-cases/file-inbox/store-message-attachments.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { DocumentType } from "../../../../src/core/domain/documents/document-record.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyFactCategory } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { CommandRoute } from "../../../../src/application/use-cases/messaging/route-command.js";
import type { ClassifyInboundIntentInput } from "../../../../src/application/use-cases/messaging/classify-inbound-intent.js";
import type { ClassifyPendingChoiceInput } from "../../../../src/application/use-cases/messaging/classify-pending-choice.js";
import type {
  PendingFamilyFactArchiveDecision,
  PendingFamilyFactDecision
} from "../../../../src/ports/state-repository-port.js";

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
        summary: "Max started swimming lessons.",
        category: "event",
        subjectId: "max"
      }),
      familyFactRecorder: factRecorder,
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "remember that Max started swimming lessons"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved family fact: Max started swimming lessons."
    });
    expect(factRecorder.seenInput).toEqual({
      summary: "Max started swimming lessons.",
      category: "event",
      subjectId: "max",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-owner",
      sourceMessageText: "remember that Max started swimming lessons"
    });
  });

  it("asks for confirmation when recording a related family fact", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    const factRecorder = new FakeFamilyFactRecorder({
      status: "needs_confirmation",
      newFact: familyFact({
        id: "fact-new",
        body: "Max prefers tea before bedtime."
      }),
      candidates: [
        familyFact({
          id: "fact-existing",
          body: "Max prefers chamomile tea before sleep."
        })
      ]
    });
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "record_fact",
        summary: "Max prefers tea before bedtime."
      }),
      familyFactRecorder: factRecorder,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "remember Max prefers tea before bedtime"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "This may update an existing family fact.",
        "New fact: Max prefers tea before bedtime.",
        "Existing candidates:",
        "1. Max prefers chamomile tea before sleep.",
        "Reply whether to update an existing fact or create a new one."
      ].join("\n")
    });
    expect(pendingFamilyFactDecisions.saved).toEqual({
      chatId: "chat-owner",
      actorId: "actor-owner",
      newFact: familyFact({
        id: "fact-new",
        body: "Max prefers tea before bedtime."
      }),
      candidates: [
        familyFact({
          id: "fact-existing",
          body: "Max prefers chamomile tea before sleep."
        })
      ],
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      expiresAt: new Date("2026-07-07T10:30:00.000Z")
    });
  });

  it("updates an existing family fact from a pending memory decision", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const factDecisionResolver = new FakeFamilyFactDecisionResolver("updated");
    const intentClassifier = new RecordingIntentClassifier({
      kind: "ask_clarification",
      question: "should not be reached"
    });
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier,
      factDecisionResolver,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "обнови существующий"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Готово: обновил семейный факт: Max prefers tea before bedtime."
    });
    expect(intentClassifier.seenInput).toBeUndefined();
    expect(factDecisionResolver.seenInput).toEqual({
      decision: "update",
      pending: pendingFamilyFactDecision()
    });
    expect(pendingFamilyFactDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("uses model choice classification when memory decision reply is unclear", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const factDecisionResolver = new FakeFamilyFactDecisionResolver("updated");
    const pendingChoiceClassifier = new FakePendingChoiceClassifier("update");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver,
      pendingChoiceClassifier,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "давай лучше так"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Готово: обновил семейный факт: Max prefers tea before bedtime."
    });
    expect(pendingChoiceClassifier.seenInput).toEqual({
      prompt: [
        "Нужно решить, что сделать с семейным фактом.",
        "Новый факт: Max prefers tea before bedtime.",
        "Похожие существующие факты:",
        "1. Max prefers chamomile tea before sleep.",
        "Что сделать?",
        "- обновить существующий факт",
        "- создать новый факт",
        "- отменить изменение"
      ].join("\n"),
      userReply: "давай лучше так",
      options: [
        {
          value: "update",
          label: "обновить существующий факт",
          description: "Update the existing family fact with the new wording."
        },
        {
          value: "create",
          label: "создать новый факт",
          description: "Save the new memory as a separate family fact."
        },
        {
          value: "cancel",
          label: "отменить изменение",
          description: "Leave family memory unchanged."
        }
      ]
    });
  });

  it("does not classify deterministic memory decision replies", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const pendingChoiceClassifier = new FakePendingChoiceClassifier("create");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver: new FakeFamilyFactDecisionResolver("updated"),
      pendingChoiceClassifier,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await useCase.execute({
      route: route("family_message"),
      context: {
        ...acceptedContext,
        text: "обнови"
      }
    });

    expect(pendingChoiceClassifier.seenInput).toBeUndefined();
  });

  it("keeps pending memory decision when model cannot classify reply", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver: new FakeFamilyFactDecisionResolver("updated"),
      pendingChoiceClassifier: new FakePendingChoiceClassifier(undefined),
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "не уверен"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "Я жду решение по семейному факту.",
        "Можно написать: \"обнови существующий\", \"создай новый\" или \"отмена\"."
      ].join("\n")
    });
    expect(pendingFamilyFactDecisions.deletedChatIds).toEqual([]);
  });

  it("passes selected memory candidate index from an update reply", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision({
      candidates: [
        familyFact({
          id: "fact-first",
          body: "Max prefers chamomile tea before sleep."
        }),
        familyFact({
          id: "fact-second",
          body: "Max likes peppermint tea."
        })
      ]
    });
    const factDecisionResolver = new FakeFamilyFactDecisionResolver("updated");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await useCase.execute({
      route: route("family_message"),
      context: {
        ...acceptedContext,
        text: "обнови второй"
      }
    });

    expect(factDecisionResolver.seenInput).toEqual({
      decision: "update",
      candidateIndex: 1,
      pending: pendingFamilyFactDecision({
        candidates: [
          familyFact({
            id: "fact-first",
            body: "Max prefers chamomile tea before sleep."
          }),
          familyFact({
            id: "fact-second",
            body: "Max likes peppermint tea."
          })
        ]
      })
    });
  });

  it("creates a new family fact from a pending memory decision", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const factDecisionResolver = new FakeFamilyFactDecisionResolver("created");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "создай новый"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Готово: сохранил новый семейный факт: Max prefers tea before bedtime."
    });
    expect(factDecisionResolver.seenInput).toEqual({
      decision: "create",
      pending: pendingFamilyFactDecision()
    });
    expect(pendingFamilyFactDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("cancels a pending memory decision", async () => {
    const pendingFamilyFactDecisions = new FakePendingFamilyFactDecisions();
    pendingFamilyFactDecisions.pending = pendingFamilyFactDecision();
    const factDecisionResolver = new FakeFamilyFactDecisionResolver("cancelled");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      factDecisionResolver,
      pendingFamilyFactDecisions,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "отмена"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Ок, не меняю семейную память."
    });
    expect(factDecisionResolver.seenInput).toEqual({
      decision: "cancel",
      pending: pendingFamilyFactDecision()
    });
    expect(pendingFamilyFactDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("recalls family facts from model answer_from_memory intent", async () => {
    const factRecall = new FakeFamilyFactRecall();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "answer_from_memory",
        query: "what do you remember about Max?"
      }),
      familyFactRecall: factRecall
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "what do you remember about Max?"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    });
    expect(factRecall.seenInput).toEqual({
      query: "what do you remember about Max?"
    });
  });

  it("archives a family fact from model archive_fact intent", async () => {
    const factArchiver = new FakeFamilyFactArchiver("archived");
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "archive_fact",
        query: "Max tea"
      }),
      familyFactArchiver: factArchiver
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "forget Max tea"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Archived family fact: Max prefers chamomile tea before sleep."
    });
    expect(factArchiver.seenInput).toEqual({
      query: "Max tea"
    });
  });

  it("reports when an archive_fact intent has no matching family fact", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "archive_fact",
        query: "Max tea"
      }),
      familyFactArchiver: new FakeFamilyFactArchiver("not_found")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "forget Max tea"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "I could not find an active family fact matching that request."
    });
  });

  it("stores pending archive candidates when archive_fact is ambiguous", async () => {
    const pendingArchiveDecisions = new FakePendingFamilyFactArchiveDecisions();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "archive_fact",
        query: "Max tea"
      }),
      familyFactArchiver: new FakeFamilyFactArchiver("ambiguous"),
      pendingFamilyFactArchiveDecisions: pendingArchiveDecisions,
      now: () => new Date("2026-07-14T07:00:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "forget Max tea"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "I found multiple active family facts that could match.",
        "1. Max prefers chamomile tea before sleep.",
        "2. Max likes peppermint tea.",
        "Reply with the number to archive, or cancel."
      ].join("\n")
    });
    expect(pendingArchiveDecisions.saved).toEqual({
      chatId: "chat-owner",
      actorId: "actor-owner",
      candidates: [
        familyFact({
          id: "fact-1",
          body: "Max prefers chamomile tea before sleep."
        }),
        familyFact({
          id: "fact-2",
          body: "Max likes peppermint tea."
        })
      ],
      createdAt: new Date("2026-07-14T07:00:00.000Z"),
      expiresAt: new Date("2026-07-14T07:30:00.000Z")
    });
  });

  it("archives a selected pending archive candidate by number", async () => {
    const pendingArchiveDecisions = new FakePendingFamilyFactArchiveDecisions();
    pendingArchiveDecisions.pending = pendingFamilyFactArchiveDecision();
    const factArchiver = new FakeFamilyFactArchiver("archived");
    const intentClassifier = new RecordingIntentClassifier({
      kind: "ask_clarification",
      question: "should not be reached"
    });
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier,
      familyFactArchiver: factArchiver,
      pendingFamilyFactArchiveDecisions: pendingArchiveDecisions,
      now: () => new Date("2026-07-14T07:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "2"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Archived family fact: Max prefers chamomile tea before sleep."
    });
    expect(intentClassifier.seenInput).toBeUndefined();
    expect(factArchiver.seenInput).toEqual({
      query: "Max likes peppermint tea.",
      factId: "fact-2"
    });
    expect(pendingArchiveDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("cancels a pending archive decision", async () => {
    const pendingArchiveDecisions = new FakePendingFamilyFactArchiveDecisions();
    pendingArchiveDecisions.pending = pendingFamilyFactArchiveDecision();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      familyFactArchiver: new FakeFamilyFactArchiver("archived"),
      pendingFamilyFactArchiveDecisions: pendingArchiveDecisions,
      now: () => new Date("2026-07-14T07:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "cancel"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Ок, не архивирую семейный факт."
    });
    expect(pendingArchiveDecisions.deletedChatIds).toEqual(["chat-owner"]);
  });

  it("keeps pending archive decision when reply is unclear", async () => {
    const pendingArchiveDecisions = new FakePendingFamilyFactArchiveDecisions();
    pendingArchiveDecisions.pending = pendingFamilyFactArchiveDecision();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      familyFactArchiver: new FakeFamilyFactArchiver("archived"),
      pendingFamilyFactArchiveDecisions: pendingArchiveDecisions,
      now: () => new Date("2026-07-14T07:05:00.000Z")
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "not sure"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: [
        "Я жду выбор семейного факта для архивации.",
        "Можно написать номер факта или \"отмена\"."
      ].join("\n")
    });
    expect(pendingArchiveDecisions.deletedChatIds).toEqual([]);
  });

  it("saves a subject alias from a model intent", async () => {
    const subjectAliasManager = new FakeSubjectAliasManager();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "save_subject_alias",
        aliasSubjectId: "Maksim",
        canonicalSubjectId: "max"
      }),
      subjectAliasManager
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "Maksim is Max"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Saved subject alias: maksim -> max"
    });
    expect(subjectAliasManager.seenInput).toEqual({
      action: "save",
      aliasSubjectId: "Maksim",
      canonicalSubjectId: "max"
    });
  });

  it("lists and diagnoses subject aliases from model intents", async () => {
    const subjectAliasManager = new FakeSubjectAliasManager();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new QueueIntentClassifier([
        {
          kind: "list_subject_aliases"
        },
        {
          kind: "diagnose_subject_aliases"
        }
      ]),
      subjectAliasManager
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "show subject aliases"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Subject aliases:\n- maksim -> max"
    });
    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "diagnose subject aliases"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Subject alias diagnostics: OK"
    });
    expect(subjectAliasManager.seenInputs).toEqual([
      {
        action: "list"
      },
      {
        action: "diagnose"
      }
    ]);
  });

  it("deletes a subject alias from a model intent", async () => {
    const subjectAliasManager = new FakeSubjectAliasManager();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "delete_subject_alias",
        aliasSubjectId: "Maksim"
      }),
      subjectAliasManager
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "delete Maksim alias"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Deleted subject alias: maksim"
    });
    expect(subjectAliasManager.seenInput).toEqual({
      action: "delete",
      aliasSubjectId: "Maksim"
    });
  });

  it("registers an external document from a model intent", async () => {
    const documentRegistrar = new FakeDocumentRegistrar();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "register_document",
        externalIdOrUrl: "https://drive.google.com/file/d/abc",
        documentType: "identity",
        subjectId: "max"
      }),
      documentRegistrar
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "register this document https://drive.google.com/file/d/abc"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Registered document: Passport.pdf (identity, subject: max)"
    });
    expect(documentRegistrar.seenInput).toEqual({
      externalIdOrUrl: "https://drive.google.com/file/d/abc",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("finds registered documents from a model intent", async () => {
    const documentLookup = new FakeDocumentLookup();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "find_document",
        query: "passport",
        documentType: "identity",
        subjectId: "max"
      }),
      documentLookup
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "show Max passport"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Registered documents:\n- Max Passport.pdf (identity, subject: max)\n  https://drive.google.com/file/d/passport"
    });
    expect(documentLookup.seenInput).toEqual({
      query: "passport",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("updates document metadata from a model intent", async () => {
    const documentManager = new FakeDocumentManager();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "update_document",
        query: "passport",
        documentType: "identity",
        subjectId: "max"
      }),
      documentManager
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "set Max passport as identity"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Updated document: Max Passport.pdf (identity, subject: max)"
    });
    expect(documentManager.seenInput).toEqual({
      action: "update_metadata",
      query: "passport",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("archives a document from a model intent", async () => {
    const documentManager = new FakeDocumentManager();
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "archive_document",
        query: "passport"
      }),
      documentManager
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "archive old passport"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Archived document: Max Passport.pdf"
    });
    expect(documentManager.seenInput).toEqual({
      action: "archive",
      query: "passport"
    });
  });

  it("reports when document registration is not configured", async () => {
    const useCase = new DispatchAcceptedCommandUseCase({
      systemHealthHandler: unusedHealthHandler,
      intentClassifier: new FakeIntentClassifier({
        kind: "register_document",
        externalIdOrUrl: "https://drive.google.com/file/d/abc"
      })
    });

    await expect(
      useCase.execute({
        route: route("family_message"),
        context: {
          ...acceptedContext,
          text: "register this document https://drive.google.com/file/d/abc"
        }
      })
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "I understood this as register_document, but that action is not connected yet."
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
      | {
          readonly kind: "record_fact";
          readonly summary: string;
          readonly category?: FamilyFactCategory;
          readonly subjectId?: string;
        }
      | { readonly kind: "answer_from_memory"; readonly query: string }
      | { readonly kind: "archive_fact"; readonly query: string }
      | {
          readonly kind: "register_document";
          readonly externalIdOrUrl: string;
          readonly documentType?: DocumentType;
          readonly subjectId?: string;
        }
      | {
          readonly kind: "find_document";
          readonly query?: string;
          readonly documentType?: DocumentType;
          readonly subjectId?: string;
        }
      | {
          readonly kind: "update_document";
          readonly query: string;
          readonly documentType?: DocumentType;
          readonly subjectId?: string;
        }
      | { readonly kind: "archive_document"; readonly query: string }
      | {
          readonly kind: "save_subject_alias";
          readonly aliasSubjectId: string;
          readonly canonicalSubjectId: string;
        }
      | { readonly kind: "list_subject_aliases" }
      | { readonly kind: "delete_subject_alias"; readonly aliasSubjectId: string }
      | { readonly kind: "diagnose_subject_aliases" }
  ) {}

  async execute(_input: ClassifyInboundIntentInput) {
    return this.intent;
  }
}

class QueueIntentClassifier {
  constructor(
    private readonly intents: ConstructorParameters<
      typeof FakeIntentClassifier
    >[0][]
  ) {}

  async execute(_input: ClassifyInboundIntentInput) {
    const intent = this.intents.shift();

    if (!intent) {
      throw new Error("no queued intent");
    }

    return intent;
  }
}

class FakeSubjectAliasManager {
  readonly seenInputs: unknown[] = [];

  get seenInput() {
    return this.seenInputs.at(-1);
  }

  async execute(input: unknown) {
    this.seenInputs.push(input);

    if (
      isRecord(input) &&
      input.action === "save" &&
      input.aliasSubjectId === "Maksim"
    ) {
      return {
        text: "Saved subject alias: maksim -> max"
      };
    }

    if (isRecord(input) && input.action === "list") {
      return {
        text: "Subject aliases:\n- maksim -> max"
      };
    }

    if (isRecord(input) && input.action === "diagnose") {
      return {
        text: "Subject alias diagnostics: OK"
      };
    }

    return {
      text: "Deleted subject alias: maksim"
    };
  }
}

class FakeFamilyFactRecall {
  seenInput: { query: string } | undefined;

  async execute(input: { query: string }) {
    this.seenInput = input;

    return {
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    };
  }
}

class FakeDocumentRegistrar {
  seenInput:
    | {
        externalIdOrUrl: string;
        documentType?: DocumentType;
        subjectId?: string;
      }
    | undefined;

  async execute(input: {
    externalIdOrUrl: string;
    documentType?: DocumentType;
    subjectId?: string;
  }) {
    this.seenInput = input;

    return {
      status: "registered" as const,
      document: {
        id: "document-1",
        provider: "google_drive" as const,
        externalId: "drive-abc",
        name: "Passport.pdf",
        url: "https://drive.google.com/file/d/abc",
        ...(input.documentType ? { documentType: input.documentType } : {}),
        ...(input.subjectId ? { subjectId: input.subjectId } : {}),
        status: "registered" as const,
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:00:00.000Z")
      }
    };
  }
}

class FakeDocumentLookup {
  seenInput:
    | { query?: string; documentType?: DocumentType; subjectId?: string }
    | undefined;

  async execute(input: {
    query?: string;
    documentType?: DocumentType;
    subjectId?: string;
  }) {
    this.seenInput = input;

    return {
      text: [
        "Registered documents:",
        "- Max Passport.pdf (identity, subject: max)",
        "  https://drive.google.com/file/d/passport"
      ].join("\n")
    };
  }
}

class FakeDocumentManager {
  seenInput:
    | {
        action: "update_metadata";
        query: string;
        documentType?: DocumentType;
        subjectId?: string;
      }
    | { action: "archive"; query: string }
    | undefined;

  async execute(
    input:
      | {
          action: "update_metadata";
          query: string;
          documentType?: DocumentType;
          subjectId?: string;
        }
      | { action: "archive"; query: string }
  ) {
    this.seenInput = input;

    return {
      text:
        input.action === "archive"
          ? "Archived document: Max Passport.pdf"
          : "Updated document: Max Passport.pdf (identity, subject: max)"
    };
  }
}

class FakeFamilyFactArchiver {
  seenInput: { query: string; factId?: string } | undefined;

  constructor(
    private readonly status: "archived" | "not_found" | "ambiguous"
  ) {}

  async execute(input: { query: string; factId?: string }) {
    this.seenInput = input;

    if (this.status === "archived") {
      return {
        status: "archived" as const,
        fact: familyFact({
          id: "fact-1",
          body: "Max prefers chamomile tea before sleep."
        })
      };
    }

    if (this.status === "ambiguous") {
      return {
        status: "ambiguous" as const,
        candidates: [
          familyFact({
            id: "fact-1",
            body: "Max prefers chamomile tea before sleep."
          }),
          familyFact({
            id: "fact-2",
            body: "Max likes peppermint tea."
          })
        ]
      };
    }

    return {
      status: "not_found" as const
    };
  }
}

class FakeFamilyFactRecorder {
  seenInput:
    | {
        summary: string;
        category?: FamilyFactCategory;
        subjectId?: string;
        sourceActorId: string;
        sourceChatId: string;
        sourceMessageText: string;
      }
    | undefined;

  constructor(
    private readonly result:
      | {
          readonly status: "created";
          readonly fact: FamilyFact;
        }
      | {
          readonly status: "needs_confirmation";
          readonly newFact: FamilyFact;
          readonly candidates: readonly FamilyFact[];
        } = {
      status: "created",
      fact: familyFact({
        id: "fact-1",
        body: "Max prefers chamomile tea before sleep."
      })
    }
  ) {}

  async execute(input: NonNullable<FakeFamilyFactRecorder["seenInput"]>) {
    this.seenInput = input;

    if (this.result.status === "created") {
      return {
        status: "created" as const,
        fact: {
          ...this.result.fact,
          body: input.summary,
          sourceActorId: input.sourceActorId,
          sourceChatId: input.sourceChatId,
          sourceMessageText: input.sourceMessageText
        }
      };
    }

    return this.result;
  }
}

function familyFact(input: Pick<FamilyFact, "id" | "body">): FamilyFact {
  return {
    id: input.id,
    category: "preference",
    body: input.body,
    sourceActorId: "actor-owner",
    sourceChatId: "chat-owner",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    updatedAt: new Date("2026-07-07T10:00:00.000Z")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pendingFamilyFactDecision(
  overrides: {
    readonly candidates?: readonly FamilyFact[];
  } = {}
): PendingFamilyFactDecision {
  return {
    chatId: "chat-owner",
    actorId: "actor-owner",
    newFact: familyFact({
      id: "fact-new",
      body: "Max prefers tea before bedtime."
    }),
    candidates: overrides.candidates ?? [
      familyFact({
        id: "fact-existing",
        body: "Max prefers chamomile tea before sleep."
      })
    ],
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    expiresAt: new Date("2026-07-07T10:30:00.000Z")
  };
}

function pendingFamilyFactArchiveDecision(): PendingFamilyFactArchiveDecision {
  return {
    chatId: "chat-owner",
    actorId: "actor-owner",
    candidates: [
      familyFact({
        id: "fact-1",
        body: "Max prefers chamomile tea before sleep."
      }),
      familyFact({
        id: "fact-2",
        body: "Max likes peppermint tea."
      })
    ],
    createdAt: new Date("2026-07-14T07:00:00.000Z"),
    expiresAt: new Date("2026-07-14T07:30:00.000Z")
  };
}

class FakeFamilyFactDecisionResolver {
  seenInput:
    | {
        decision: "update" | "create" | "cancel";
        candidateIndex?: number;
        pending: PendingFamilyFactDecision;
      }
    | undefined;

  constructor(private readonly status: "updated" | "created" | "cancelled") {}

  async execute(input: NonNullable<FakeFamilyFactDecisionResolver["seenInput"]>) {
    this.seenInput = input;

    if (this.status === "cancelled") {
      return {
        status: "cancelled" as const
      };
    }

    return {
      status: this.status,
      fact:
        this.status === "updated"
          ? {
              ...input.pending.newFact,
              id: input.pending.candidates[0]!.id
            }
          : input.pending.newFact
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

class FakePendingFamilyFactArchiveDecisions {
  pending: PendingFamilyFactArchiveDecision | undefined;
  saved: PendingFamilyFactArchiveDecision | undefined;
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

  async save(input: PendingFamilyFactArchiveDecision): Promise<void> {
    this.saved = input;
  }

  async clearByChatId(chatId: string): Promise<void> {
    this.deletedChatIds.push(chatId);
    this.pending = undefined;
  }
}

class FakePendingFamilyFactDecisions {
  pending: PendingFamilyFactDecision | undefined;
  saved: PendingFamilyFactDecision | undefined;
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

  async save(input: PendingFamilyFactDecision) {
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

  constructor(
    private readonly choice:
      | "copy"
      | "overwrite"
      | "skip"
      | "update"
      | "create"
      | "cancel"
      | undefined
  ) {}

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
