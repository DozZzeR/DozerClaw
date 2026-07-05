import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteFileInboxRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-file-inbox-repository.js";

describe("SqliteFileInboxRepository", () => {
  it("saves and finds file inbox records by id", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteFileInboxRepository(database);

    await repository.saveFileInboxRecord({
      id: "file-inbox-1",
      originalFileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
      storageId: "stored-file-1",
      storagePath: "inbox/file-inbox-1/report.pdf",
      receivedAt: new Date("2026-07-03T10:59:00.000Z"),
      createdAt: new Date("2026-07-03T11:00:00.000Z")
    });

    await expect(repository.findFileInboxRecordById("file-inbox-1")).resolves.toEqual({
      id: "file-inbox-1",
      originalFileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
      storageId: "stored-file-1",
      storagePath: "inbox/file-inbox-1/report.pdf",
      receivedAt: new Date("2026-07-03T10:59:00.000Z"),
      createdAt: new Date("2026-07-03T11:00:00.000Z")
    });
    await expect(
      repository.findLatestFileInboxRecordByOriginalFileName("report.pdf")
    ).resolves.toEqual({
      id: "file-inbox-1",
      originalFileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 123,
      storageId: "stored-file-1",
      storagePath: "inbox/file-inbox-1/report.pdf",
      receivedAt: new Date("2026-07-03T10:59:00.000Z"),
      createdAt: new Date("2026-07-03T11:00:00.000Z")
    });

    database.close();
  });

  it("returns undefined for missing records", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteFileInboxRepository(database);

    await expect(repository.findFileInboxRecordById("missing")).resolves.toBeUndefined();
    await expect(
      repository.findLatestFileInboxRecordByOriginalFileName("missing.pdf")
    ).resolves.toBeUndefined();

    database.close();
  });

  it("returns the latest record for duplicate original filenames", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteFileInboxRepository(database);

    await repository.saveFileInboxRecord({
      id: "file-inbox-1",
      originalFileName: "report.pdf",
      sizeBytes: 123,
      storageId: "stored-file-1",
      storagePath: "inbox/file-inbox-1/report.pdf",
      receivedAt: new Date("2026-07-03T10:59:00.000Z"),
      createdAt: new Date("2026-07-03T11:00:00.000Z")
    });
    await repository.saveFileInboxRecord({
      id: "file-inbox-2",
      originalFileName: "report.pdf",
      sizeBytes: 456,
      storageId: "stored-file-2",
      storagePath: "inbox/file-inbox-2/report.pdf",
      receivedAt: new Date("2026-07-03T11:59:00.000Z"),
      createdAt: new Date("2026-07-03T12:00:00.000Z")
    });

    await expect(
      repository.findLatestFileInboxRecordByOriginalFileName("report.pdf")
    ).resolves.toEqual({
      id: "file-inbox-2",
      originalFileName: "report.pdf",
      sizeBytes: 456,
      storageId: "stored-file-2",
      storagePath: "inbox/file-inbox-2/report.pdf",
      receivedAt: new Date("2026-07-03T11:59:00.000Z"),
      createdAt: new Date("2026-07-03T12:00:00.000Z")
    });

    database.close();
  });
});
