import { describe, expect, it } from "vitest";

import { FindDocumentsUseCase } from "../../../../src/application/use-cases/documents/find-documents.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type {
  DocumentRepositoryPort,
  SearchDocumentsInput
} from "../../../../src/ports/document-repository-port.js";
import type {
  MemoryEntryInput,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";

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

  it("uses semantic document references and resolves them through SQLite", async () => {
    const semanticDocument = documentRecord({
      id: "document-semantic",
      name: "Serbian ID card.pdf",
      url: "https://drive.google.com/file/d/serbian-id",
      documentType: "identity",
      subjectId: "alex"
    });
    const repository = new RecordingDocumentRepository([], [semanticDocument]);
    const semanticMemory = new StubSemanticMemory([
      {
        entry: {
          id: "drawer-1",
          body: [
            "Document: Serbian ID card.pdf",
            "User search description: личная карта Алекса",
            "Reference: document:document-semantic"
          ].join("\n")
        }
      }
    ]);
    const useCase = new FindDocumentsUseCase({
      repository,
      semanticMemory,
      limit: 5
    });

    await expect(
      useCase.execute({
        query: "личная карта"
      })
    ).resolves.toEqual({
      text: [
        "Registered documents:",
        "- Serbian ID card.pdf (identity, subject: alex)",
        "  https://drive.google.com/file/d/serbian-id"
      ].join("\n")
    });
    expect(repository.seenInput).toEqual({
      query: "личная карта",
      limit: 5
    });
    expect(semanticMemory.seenQuery).toEqual({
      text: "личная карта",
      limit: 5
    });
    expect(repository.seenIds).toEqual(["document-semantic"]);
  });

  it("falls back to SQL results when semantic search fails", async () => {
    const repository = new RecordingDocumentRepository([
      documentRecord({
        id: "document-sql",
        name: "Passport.pdf",
        url: "https://drive.google.com/file/d/passport",
        documentType: "identity",
        subjectId: "max"
      })
    ]);
    const useCase = new FindDocumentsUseCase({
      repository,
      semanticMemory: new ThrowingSemanticMemory(),
      limit: 5
    });

    await expect(useCase.execute({ query: "passport" })).resolves.toEqual({
      text: [
        "Registered documents:",
        "- Passport.pdf (identity, subject: max)",
        "  https://drive.google.com/file/d/passport"
      ].join("\n")
    });
    expect(repository.seenIds).toBeUndefined();
  });
});

class RecordingDocumentRepository implements DocumentRepositoryPort {
  seenInput: SearchDocumentsInput | undefined;
  seenIds: readonly string[] | undefined;

  constructor(
    private readonly documents: readonly DocumentRecord[],
    private readonly documentsById: readonly DocumentRecord[] = []
  ) {}

  async saveDocument(): Promise<void> {
    throw new Error("should not save");
  }

  async findDocumentByExternalId(): Promise<DocumentRecord | undefined> {
    throw new Error("should not find by external id");
  }

  async findDocumentsByIds(ids: readonly string[]): Promise<readonly DocumentRecord[]> {
    this.seenIds = ids;

    return this.documentsById.filter((document) => ids.includes(document.id));
  }

  async searchDocuments(input: SearchDocumentsInput): Promise<readonly DocumentRecord[]> {
    this.seenInput = input;

    return this.documents;
  }
}

class StubSemanticMemory {
  seenQuery: MemorySearchQuery | undefined;

  constructor(
    private readonly results: readonly {
      readonly entry: { readonly id: string; readonly body: string };
      readonly score?: number;
    }[]
  ) {}

  async store(_entry: MemoryEntryInput): Promise<never> {
    throw new Error("should not store");
  }

  async search(query: MemorySearchQuery) {
    this.seenQuery = query;

    return this.results;
  }
}

class ThrowingSemanticMemory {
  async store(_entry: MemoryEntryInput): Promise<never> {
    throw new Error("should not store");
  }

  async search(_query: MemorySearchQuery): Promise<never> {
    throw new Error("semantic unavailable");
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
