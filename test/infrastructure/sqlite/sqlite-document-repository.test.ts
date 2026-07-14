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
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:30:00.000Z")
      })
    );

    database.close();
  });
});
