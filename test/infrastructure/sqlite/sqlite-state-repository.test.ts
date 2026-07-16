import { describe, expect, it } from "vitest";

import type { DocumentRecord } from "../../../src/core/domain/documents/document-record.js";
import type { FamilyFact } from "../../../src/core/domain/family-memory/family-fact.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteStateRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-state-repository.js";

describe("SqliteStateRepository", () => {
  it("reports SQLite reachability", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await expect(repository.healthCheck()).resolves.toEqual({
      ok: true,
      detail: "SQLite reachable"
    });

    database.close();
  });

  it("stores and clears active pending clarifications by chat", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await repository.savePendingClarification({
      chatId: "chat-1",
      actorId: "actor-1",
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
    });

    await expect(
      repository.findActivePendingClarificationByChatId(
        "chat-1",
        new Date("2026-07-02T20:05:00.000Z")
      )
    ).resolves.toEqual({
      chatId: "chat-1",
      actorId: "actor-1",
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
    });

    await expect(
      repository.findActivePendingClarificationByChatId(
        "chat-1",
        new Date("2026-07-02T20:31:00.000Z")
      )
    ).resolves.toBeUndefined();

    await repository.clearPendingClarificationByChatId("chat-1");
    await expect(
      repository.findActivePendingClarificationByChatId(
        "chat-1",
        new Date("2026-07-02T20:05:00.000Z")
      )
    ).resolves.toBeUndefined();

    database.close();
  });

  it("stores and clears active pending file duplicate decisions by chat", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await repository.savePendingFileDuplicateDecision({
      chatId: "chat-1",
      actorId: "actor-1",
      fileName: "report.pdf",
      suggestedCopyName: "report (2).pdf",
      existingRecordId: "file-existing",
      provider: "telegram",
      receivedAt: new Date("2026-07-02T19:59:00.000Z"),
      sourceAttachment: {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123
      },
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    });

    await expect(
      repository.findActivePendingFileDuplicateDecisionByChatId(
        "chat-1",
        new Date("2026-07-02T20:05:00.000Z")
      )
    ).resolves.toEqual({
      chatId: "chat-1",
      actorId: "actor-1",
      fileName: "report.pdf",
      suggestedCopyName: "report (2).pdf",
      existingRecordId: "file-existing",
      provider: "telegram",
      receivedAt: new Date("2026-07-02T19:59:00.000Z"),
      sourceAttachment: {
        id: "attachment-1",
        providerFileId: "telegram-file-1",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123
      },
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      expiresAt: new Date("2026-07-02T20:30:00.000Z")
    });

    await expect(
      repository.findActivePendingFileDuplicateDecisionByChatId(
        "chat-1",
        new Date("2026-07-02T20:31:00.000Z")
      )
    ).resolves.toBeUndefined();

    await repository.clearPendingFileDuplicateDecisionByChatId("chat-1");
    await expect(
      repository.findActivePendingFileDuplicateDecisionByChatId(
        "chat-1",
        new Date("2026-07-02T20:05:00.000Z")
      )
    ).resolves.toBeUndefined();

    database.close();
  });

  it("stores and clears active pending family fact decisions by chat", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await repository.savePendingFamilyFactDecision({
      chatId: "chat-1",
      actorId: "actor-1",
      newFact: {
        id: "fact-new",
        category: "preference",
        body: "Max prefers tea before bedtime.",
        sourceActorId: "actor-1",
        sourceChatId: "chat-1",
        sourceMessageText: "remember Max prefers tea before bedtime",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      },
      candidates: [
        {
          id: "fact-existing",
          category: "preference",
          body: "Max prefers chamomile tea before sleep.",
          sourceActorId: "actor-1",
          sourceChatId: "chat-1",
          sourceMessageText: "remember Max prefers chamomile tea before sleep",
          status: "active",
          createdAt: new Date("2026-07-07T09:00:00.000Z"),
          updatedAt: new Date("2026-07-07T09:00:00.000Z")
        }
      ],
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      expiresAt: new Date("2026-07-07T10:30:00.000Z")
    });

    await expect(
      repository.findActivePendingFamilyFactDecisionByChatId(
        "chat-1",
        new Date("2026-07-07T10:05:00.000Z")
      )
    ).resolves.toEqual({
      chatId: "chat-1",
      actorId: "actor-1",
      newFact: {
        id: "fact-new",
        category: "preference",
        body: "Max prefers tea before bedtime.",
        sourceActorId: "actor-1",
        sourceChatId: "chat-1",
        sourceMessageText: "remember Max prefers tea before bedtime",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      },
      candidates: [
        {
          id: "fact-existing",
          category: "preference",
          body: "Max prefers chamomile tea before sleep.",
          sourceActorId: "actor-1",
          sourceChatId: "chat-1",
          sourceMessageText: "remember Max prefers chamomile tea before sleep",
          status: "active",
          createdAt: new Date("2026-07-07T09:00:00.000Z"),
          updatedAt: new Date("2026-07-07T09:00:00.000Z")
        }
      ],
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      expiresAt: new Date("2026-07-07T10:30:00.000Z")
    });

    await expect(
      repository.findActivePendingFamilyFactDecisionByChatId(
        "chat-1",
        new Date("2026-07-07T10:31:00.000Z")
      )
    ).resolves.toBeUndefined();

    await repository.clearPendingFamilyFactDecisionByChatId("chat-1");
    await expect(
      repository.findActivePendingFamilyFactDecisionByChatId(
        "chat-1",
        new Date("2026-07-07T10:05:00.000Z")
      )
    ).resolves.toBeUndefined();

    database.close();
  });

  it("stores and clears active pending family fact archive decisions by chat", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await repository.savePendingFamilyFactArchiveDecision({
      chatId: "chat-1",
      actorId: "actor-1",
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

    await expect(
      repository.findActivePendingFamilyFactArchiveDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:10:00.000Z")
      )
    ).resolves.toEqual({
      chatId: "chat-1",
      actorId: "actor-1",
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

    await expect(
      repository.findActivePendingFamilyFactArchiveDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:31:00.000Z")
      )
    ).resolves.toBeUndefined();

    await repository.clearPendingFamilyFactArchiveDecisionByChatId("chat-1");
    await expect(
      repository.findActivePendingFamilyFactArchiveDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:10:00.000Z")
      )
    ).resolves.toBeUndefined();

    database.close();
  });

  it("stores and clears active pending document decisions by chat", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteStateRepository(database);

    await repository.savePendingDocumentDecision({
      chatId: "chat-1",
      actorId: "actor-1",
      action: {
        kind: "update_metadata",
        documentType: "identity",
        subjectId: "max"
      },
      candidates: [
        documentRecord({ id: "document-1", name: "Max Passport.pdf" }),
        documentRecord({ id: "document-2", name: "Sofia Passport.pdf" })
      ],
      createdAt: new Date("2026-07-14T07:00:00.000Z"),
      expiresAt: new Date("2026-07-14T07:30:00.000Z")
    });

    await expect(
      repository.findActivePendingDocumentDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:10:00.000Z")
      )
    ).resolves.toEqual({
      chatId: "chat-1",
      actorId: "actor-1",
      action: {
        kind: "update_metadata",
        documentType: "identity",
        subjectId: "max"
      },
      candidates: [
        documentRecord({ id: "document-1", name: "Max Passport.pdf" }),
        documentRecord({ id: "document-2", name: "Sofia Passport.pdf" })
      ],
      createdAt: new Date("2026-07-14T07:00:00.000Z"),
      expiresAt: new Date("2026-07-14T07:30:00.000Z")
    });

    await expect(
      repository.findActivePendingDocumentDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:31:00.000Z")
      )
    ).resolves.toBeUndefined();

    await repository.clearPendingDocumentDecisionByChatId("chat-1");
    await expect(
      repository.findActivePendingDocumentDecisionByChatId(
        "chat-1",
        new Date("2026-07-14T07:10:00.000Z")
      )
    ).resolves.toBeUndefined();

    database.close();
  });
});

function documentRecord(
  input: Pick<DocumentRecord, "id" | "name">
): DocumentRecord {
  return {
    id: input.id,
    provider: "google_drive",
    externalId: input.id,
    name: input.name,
    url: `https://drive.google.com/file/d/${input.id}`,
    documentType: "identity",
    subjectId: "max",
    status: "registered",
    createdAt: new Date("2026-07-14T07:00:00.000Z"),
    updatedAt: new Date("2026-07-14T07:00:00.000Z")
  };
}

function familyFact(input: Pick<FamilyFact, "id" | "body">): FamilyFact {
  return {
    id: input.id,
    category: "preference",
    body: input.body,
    sourceActorId: "actor-1",
    sourceChatId: "chat-1",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-14T07:00:00.000Z"),
    updatedAt: new Date("2026-07-14T07:00:00.000Z")
  };
}
