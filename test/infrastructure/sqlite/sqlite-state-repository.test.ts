import { describe, expect, it } from "vitest";

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
});
