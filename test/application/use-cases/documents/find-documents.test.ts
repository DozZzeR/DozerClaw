import { describe, expect, it } from "vitest";

import { FindDocumentsUseCase } from "../../../../src/application/use-cases/documents/find-documents.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type {
  DocumentRepositoryPort,
  SearchDocumentsInput
} from "../../../../src/ports/document-repository-port.js";

describe("FindDocumentsUseCase", () => {
  it("formats matching registered documents", async () => {
    const repository = new RecordingDocumentRepository([
      documentRecord({
        id: "document-1",
        name: "Max Passport.pdf",
        url: "https://drive.google.com/file/d/passport",
        documentType: "identity",
        subjectId: "max"
      })
    ]);
    const useCase = new FindDocumentsUseCase({
      repository,
      limit: 5
    });

    await expect(
      useCase.execute({
        query: "passport",
        documentType: "identity",
        subjectId: "max"
      })
    ).resolves.toEqual({
      text: [
        "Registered documents:",
        "- Max Passport.pdf (identity, subject: max)",
        "  https://drive.google.com/file/d/passport"
      ].join("\n")
    });
    expect(repository.seenInput).toEqual({
      query: "passport",
      documentType: "identity",
      subjectId: "max",
      limit: 5
    });
  });

  it("returns a clear empty state", async () => {
    const useCase = new FindDocumentsUseCase({
      repository: new RecordingDocumentRepository([]),
      limit: 5
    });

    await expect(
      useCase.execute({
        query: "passport"
      })
    ).resolves.toEqual({
      text: "No registered documents matched that request."
    });
  });
});

class RecordingDocumentRepository implements DocumentRepositoryPort {
  seenInput: SearchDocumentsInput | undefined;

  constructor(private readonly documents: readonly DocumentRecord[]) {}

  async saveDocument(): Promise<void> {
    throw new Error("should not save");
  }

  async findDocumentByExternalId(): Promise<DocumentRecord | undefined> {
    throw new Error("should not find by external id");
  }

  async searchDocuments(input: SearchDocumentsInput): Promise<readonly DocumentRecord[]> {
    this.seenInput = input;

    return this.documents;
  }
}

function documentRecord(
  overrides: Pick<
    DocumentRecord,
    "id" | "name" | "url" | "documentType" | "subjectId"
  >
): DocumentRecord {
  return {
    id: overrides.id,
    provider: "google_drive",
    externalId: overrides.id,
    name: overrides.name,
    url: overrides.url,
    ...(overrides.documentType
      ? { documentType: overrides.documentType }
      : {}),
    ...(overrides.subjectId ? { subjectId: overrides.subjectId } : {}),
    status: "registered",
    createdAt: new Date("2026-07-14T08:00:00.000Z"),
    updatedAt: new Date("2026-07-14T08:00:00.000Z")
  };
}
