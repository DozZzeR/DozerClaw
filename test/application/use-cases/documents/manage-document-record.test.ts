import { describe, expect, it } from "vitest";

import { ManageDocumentRecordUseCase } from "../../../../src/application/use-cases/documents/manage-document-record.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type {
  DocumentRepositoryPort,
  SearchDocumentsInput
} from "../../../../src/ports/document-repository-port.js";

describe("ManageDocumentRecordUseCase", () => {
  it("updates metadata for one matching registered document", async () => {
    const repository = new RecordingDocumentRepository([
      documentRecord({
        id: "document-1",
        name: "Max Passport.pdf",
        documentType: "other",
        subjectId: "family"
      })
    ]);
    const useCase = new ManageDocumentRecordUseCase({
      repository,
      now: () => new Date("2026-07-14T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "update_metadata",
        query: "passport",
        documentType: "identity",
        subjectId: "max"
      })
    ).resolves.toEqual({
      text: "Updated document: Max Passport.pdf (identity, subject: max)"
    });
    expect(repository.seenSearch).toEqual({
      query: "passport",
      limit: 2
    });
    expect(repository.saved).toEqual(
      expect.objectContaining({
        id: "document-1",
        documentType: "identity",
        subjectId: "max",
        status: "registered",
        updatedAt: new Date("2026-07-14T09:00:00.000Z")
      })
    );
  });

  it("archives one matching registered document", async () => {
    const repository = new RecordingDocumentRepository([
      documentRecord({
        id: "document-1",
        name: "Max Passport.pdf",
        documentType: "identity",
        subjectId: "max"
      })
    ]);
    const useCase = new ManageDocumentRecordUseCase({
      repository,
      now: () => new Date("2026-07-14T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "archive",
        query: "passport"
      })
    ).resolves.toEqual({
      text: "Archived document: Max Passport.pdf"
    });
    expect(repository.saved).toEqual(
      expect.objectContaining({
        id: "document-1",
        status: "archived",
        updatedAt: new Date("2026-07-14T09:00:00.000Z")
      })
    );
  });

  it("reports not found and ambiguous matches without saving", async () => {
    const emptyRepository = new RecordingDocumentRepository([]);
    const emptyUseCase = new ManageDocumentRecordUseCase({
      repository: emptyRepository,
      now: () => new Date("2026-07-14T09:00:00.000Z")
    });

    await expect(
      emptyUseCase.execute({
        action: "archive",
        query: "passport"
      })
    ).resolves.toEqual({
      text: "No registered documents matched that request."
    });
    expect(emptyRepository.saved).toBeUndefined();

    const ambiguousRepository = new RecordingDocumentRepository([
      documentRecord({ id: "document-1", name: "Max Passport.pdf" }),
      documentRecord({ id: "document-2", name: "Sofia Passport.pdf" })
    ]);
    const ambiguousUseCase = new ManageDocumentRecordUseCase({
      repository: ambiguousRepository,
      now: () => new Date("2026-07-14T09:00:00.000Z")
    });

    await expect(
      ambiguousUseCase.execute({
        action: "archive",
        query: "passport"
      })
    ).resolves.toEqual({
      text: [
        "I found multiple registered documents that could match.",
        "1. Max Passport.pdf",
        "2. Sofia Passport.pdf",
        "Reply with the number to choose, or cancel."
      ].join("\n"),
      pending: {
        action: {
          action: "archive",
          query: "passport"
        },
        candidates: [
          documentRecord({ id: "document-1", name: "Max Passport.pdf" }),
          documentRecord({ id: "document-2", name: "Sofia Passport.pdf" })
        ]
      }
    });
    expect(ambiguousRepository.saved).toBeUndefined();
  });
});

class RecordingDocumentRepository implements DocumentRepositoryPort {
  seenSearch: SearchDocumentsInput | undefined;
  saved: DocumentRecord | undefined;

  constructor(private readonly documents: readonly DocumentRecord[]) {}

  async saveDocument(document: DocumentRecord): Promise<void> {
    this.saved = document;
  }

  async findDocumentByExternalId(): Promise<DocumentRecord | undefined> {
    throw new Error("should not find by external id");
  }

  async findDocumentsByIds(): Promise<readonly DocumentRecord[]> {
    throw new Error("should not find by ids");
  }

  async searchDocuments(
    input: SearchDocumentsInput
  ): Promise<readonly DocumentRecord[]> {
    this.seenSearch = input;

    return this.documents;
  }
}

function documentRecord(
  overrides: Pick<DocumentRecord, "id" | "name"> &
    Partial<Pick<DocumentRecord, "documentType" | "subjectId">>
): DocumentRecord {
  return {
    id: overrides.id,
    provider: "google_drive",
    externalId: overrides.id,
    name: overrides.name,
    url: `https://drive.google.com/file/d/${overrides.id}`,
    ...(overrides.documentType
      ? { documentType: overrides.documentType }
      : {}),
    ...(overrides.subjectId ? { subjectId: overrides.subjectId } : {}),
    status: "registered",
    createdAt: new Date("2026-07-14T08:00:00.000Z"),
    updatedAt: new Date("2026-07-14T08:00:00.000Z")
  };
}
