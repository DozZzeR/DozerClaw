import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runDevRepairDocuments } from "../../../src/entrypoints/cli/dev-repair-documents.js";
import type { DocumentRecord } from "../../../src/core/domain/documents/document-record.js";
import { createSqliteDatabase } from "../../../src/infrastructure/providers/sqlite/sqlite-database.js";
import { SqliteDocumentRepository } from "../../../src/infrastructure/providers/sqlite/sqlite-document-repository.js";

describe("runDevRepairDocuments", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevRepairDocuments({
      env: {
        NODE_ENV: "production"
      },
      write: (line) => lines.push(line)
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      "dev document repair is not available in production."
    ]);
  });

  it("dry-runs planned document metadata repairs by default", async () => {
    const fixture = await createDocumentFixture();
    const lines: string[] = [];

    try {
      const exitCode = await runDevRepairDocuments({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: fixture.databasePath
        },
        write: (line) => lines.push(line)
      });

      expect(exitCode).toBe(0);
      expect(lines).toEqual([
        "document repair mode: dry-run",
        "planned: паспорт Горяйнов А В.pdf subjectId: ∅ -> alexey; url: https://drive.google.com/file/d/drive-alexey/view?usp=drivesdk -> https://drive.google.com/open?id=drive-alexey",
        "planned: GoryainovaVA-lična karta.pdf subjectId: ∅ -> victoria; url: https://drive.google.com/file/d/drive-victoria/view?usp=drivesdk -> https://drive.google.com/open?id=drive-victoria",
        "summary: planned=2 applied=0 skipped=1"
      ]);

      const alexey = await fixture.repository.findDocumentByExternalId(
        "google_drive",
        "drive-alexey"
      );
      expect(alexey?.subjectId).toBeUndefined();
      expect(alexey?.url).toBe(
        "https://drive.google.com/file/d/drive-alexey/view?usp=drivesdk"
      );
    } finally {
      fixture.close();
    }
  });

  it("applies document metadata repairs when explicitly enabled", async () => {
    const fixture = await createDocumentFixture();
    const lines: string[] = [];

    try {
      const firstExitCode = await runDevRepairDocuments({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: fixture.databasePath,
          DOZERCLAW_DEV_REPAIR_DOCUMENTS_APPLY: "1"
        },
        write: (line) => lines.push(line)
      });

      expect(firstExitCode).toBe(0);
      await expect(fixture.repository.findDocumentByExternalId(
        "google_drive",
        "drive-alexey"
      )).resolves.toEqual(
        expect.objectContaining({
          documentType: "identity",
          subjectId: "alexey",
          url: "https://drive.google.com/open?id=drive-alexey"
        })
      );
      await expect(fixture.repository.findDocumentByExternalId(
        "google_drive",
        "drive-victoria"
      )).resolves.toEqual(
        expect.objectContaining({
          documentType: "identity",
          subjectId: "victoria",
          url: "https://drive.google.com/open?id=drive-victoria"
        })
      );
      const unknown = await fixture.repository.findDocumentByExternalId(
        "google_drive",
        "drive-unknown"
      );
      expect(unknown?.subjectId).toBeUndefined();
      expect(unknown?.url).toBe("https://drive.google.com/file/d/drive-unknown/view");

      const secondLines: string[] = [];
      const secondExitCode = await runDevRepairDocuments({
        env: {
          NODE_ENV: "test",
          DOZERCLAW_DB_PATH: fixture.databasePath,
          DOZERCLAW_DEV_REPAIR_DOCUMENTS_APPLY: "true"
        },
        write: (line) => secondLines.push(line)
      });

      expect(secondExitCode).toBe(0);
      expect(secondLines).toEqual([
        "document repair mode: apply",
        "summary: planned=0 applied=0 skipped=3"
      ]);
    } finally {
      fixture.close();
    }
  });
});

async function createDocumentFixture(): Promise<{
  readonly databasePath: string;
  readonly repository: SqliteDocumentRepository;
  readonly close: () => void;
}> {
  const directory = mkdtempSync(join(tmpdir(), "dozerclaw-repair-docs-"));
  const databasePath = join(directory, "dozerclaw.sqlite");
  const database = createSqliteDatabase({ path: databasePath });
  const repository = new SqliteDocumentRepository(database);

  await repository.saveDocument(documentRecord({
    id: "document-alexey",
    externalId: "drive-alexey",
    name: "паспорт Горяйнов А В.pdf",
    url: "https://drive.google.com/file/d/drive-alexey/view?usp=drivesdk",
    documentType: "identity"
  }));
  await repository.saveDocument(documentRecord({
    id: "document-victoria",
    externalId: "drive-victoria",
    name: "GoryainovaVA-lična karta.pdf",
    url: "https://drive.google.com/file/d/drive-victoria/view?usp=drivesdk",
    documentType: "identity"
  }));
  await repository.saveDocument(documentRecord({
    id: "document-unknown",
    externalId: "drive-unknown",
    name: "unclassified.pdf",
    url: "https://drive.google.com/file/d/drive-unknown/view",
    documentType: "other"
  }));

  return {
    databasePath,
    repository,
    close() {
      database.close();
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

function documentRecord(
  input: Pick<DocumentRecord, "id" | "externalId" | "name" | "url"> &
    Partial<Pick<DocumentRecord, "documentType" | "subjectId">>
): DocumentRecord {
  return {
    id: input.id,
    provider: "google_drive",
    externalId: input.externalId,
    name: input.name,
    url: input.url,
    ...(input.documentType ? { documentType: input.documentType } : {}),
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    status: "registered",
    createdAt: new Date("2026-07-22T08:00:00.000Z"),
    updatedAt: new Date("2026-07-22T08:00:00.000Z")
  };
}
