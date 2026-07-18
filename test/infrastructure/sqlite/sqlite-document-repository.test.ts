import { describe, expect, it } from "vitest";

import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteDocumentRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-document-repository.js";

describe("SqliteDocumentRepository", () => {
  it("persists and finds documents by provider and external id", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteDocumentRepository(database);

    await repository.saveDocument({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/abc",
      documentType: "identity",
      subjectId: "max",
      semanticMemoryEntryId: "drawer-document-1",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:00:00.000Z")
    });

    await expect(
      repository.findDocumentByExternalId("google_drive", "drive-abc")
    ).resolves.toEqual({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/abc",
      documentType: "identity",
      subjectId: "max",
      semanticMemoryEntryId: "drawer-document-1",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:00:00.000Z")
    });

    database.close();
  });

  it("updates existing documents by id", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteDocumentRepository(database);

    await repository.saveDocument({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-abc",
      name: "Old.pdf",
      url: "https://drive.google.com/file/d/old",
      documentType: "identity",
      subjectId: "max",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:00:00.000Z")
    });
    await repository.saveDocument({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-abc",
      name: "New.pdf",
      url: "https://drive.google.com/file/d/new",
      documentType: "travel",
      subjectId: "family",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:30:00.000Z")
    });

    await expect(
      repository.findDocumentByExternalId("google_drive", "drive-abc")
    ).resolves.toEqual(
      expect.objectContaining({
        id: "document-1",
        name: "New.pdf",
        url: "https://drive.google.com/file/d/new",
        documentType: "travel",
        subjectId: "family",
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:30:00.000Z")
      })
    );

    database.close();
  });

  it("searches registered documents by type, subject, and query", async () => {
    const database = createSqliteDatabase({ path: ":memory:" });
    const repository = new SqliteDocumentRepository(database);

    await repository.saveDocument({
      id: "document-passport",
      provider: "google_drive",
      externalId: "drive-passport",
      name: "Max Passport.pdf",
      url: "https://drive.google.com/file/d/passport",
      documentType: "identity",
      subjectId: "max",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:00:00.000Z")
    });
    await repository.saveDocument({
      id: "document-ticket",
      provider: "google_drive",
      externalId: "drive-ticket",
      name: "Family train ticket.pdf",
      url: "https://drive.google.com/file/d/ticket",
      documentType: "travel",
      subjectId: "family",
      status: "registered",
      createdAt: new Date("2026-07-14T08:10:00.000Z"),
      updatedAt: new Date("2026-07-14T08:10:00.000Z")
    });
    await repository.saveDocument({
      id: "document-archived",
      provider: "google_drive",
      externalId: "drive-old",
      name: "Old Max Passport.pdf",
      url: "https://drive.google.com/file/d/old",
      documentType: "identity",
      subjectId: "max",
      status: "archived",
      createdAt: new Date("2026-07-14T08:20:00.000Z"),
      updatedAt: new Date("2026-07-14T08:20:00.000Z")
    });

    await expect(
      repository.searchDocuments({
        query: "passport",
        documentType: "identity",
        subjectId: "max",
        limit: 10
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "document-passport",
        name: "Max Passport.pdf",
        documentType: "identity",
        subjectId: "max"
      })
    ]);

    await expect(
      repository.searchDocuments({
        query: "family",
        limit: 10
      })
    ).resolves.toEqual([
      expect.objectContaining({
        id: "document-ticket"
      })
    ]);

    database.close();
  });
});
