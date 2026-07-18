import { describe, expect, it } from "vitest";

import { RecordDocumentSearchDescriptionUseCase } from "../../../../src/application/use-cases/documents/record-document-search-description.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type {
  MemoryEntryInput,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";

describe("RecordDocumentSearchDescriptionUseCase", () => {
  it("stores a semantic document description and saves the entry id", async () => {
    const repository = new RecordingDocumentRepository();
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new RecordDocumentSearchDescriptionUseCase({
      repository,
      semanticMemory,
      now: () => new Date("2026-07-18T17:10:00.000Z")
    });

    await expect(
      useCase.execute({
        document: documentRecord(),
        description: "Serbian identity card scan for Alex"
      })
    ).resolves.toEqual({
      status: "stored",
      document: {
        ...documentRecord(),
        semanticMemoryEntryId: "drawer-document-1",
        updatedAt: new Date("2026-07-18T17:10:00.000Z")
      }
    });
    expect(semanticMemory.stored).toEqual({
      body: [
        "Document: GoryainovAV-lična karta.pdf",
        "User search description: Serbian identity card scan for Alex",
        "Type: identity",
        "Subject: alex",
        "Google Drive URL: https://drive.google.com/file/d/drive-card"
      ].join("\n"),
      references: ["document:document-1", "google_drive:drive-card"]
    });
    expect(repository.saved).toEqual({
      ...documentRecord(),
      semanticMemoryEntryId: "drawer-document-1",
      updatedAt: new Date("2026-07-18T17:10:00.000Z")
    });
  });

  it("keeps the structured document when semantic memory is unavailable", async () => {
    const repository = new RecordingDocumentRepository();
    const useCase = new RecordDocumentSearchDescriptionUseCase({
      repository,
      semanticMemory: new ThrowingSemanticMemory(),
      now: () => new Date("2026-07-18T17:10:00.000Z")
    });

    await expect(
      useCase.execute({
        document: documentRecord(),
        description: "Serbian identity card scan for Alex"
      })
    ).resolves.toEqual({
      status: "semantic_unavailable",
      document: documentRecord()
    });
    expect(repository.saved).toBeUndefined();
  });
});

function documentRecord(): DocumentRecord {
  return {
    id: "document-1",
    provider: "google_drive",
    externalId: "drive-card",
    name: "GoryainovAV-lična karta.pdf",
    url: "https://drive.google.com/file/d/drive-card",
    documentType: "identity",
    subjectId: "alex",
    status: "registered",
    createdAt: new Date("2026-07-18T17:00:00.000Z"),
    updatedAt: new Date("2026-07-18T17:00:00.000Z")
  };
}

class RecordingDocumentRepository {
  saved: DocumentRecord | undefined;

  async saveDocument(document: DocumentRecord): Promise<void> {
    this.saved = document;
  }

  async findDocumentByExternalId(): Promise<DocumentRecord | undefined> {
    throw new Error("should not be called");
  }

  async findDocumentsByIds(): Promise<readonly DocumentRecord[]> {
    throw new Error("should not be called");
  }

  async searchDocuments(): Promise<readonly DocumentRecord[]> {
    throw new Error("should not be called");
  }
}

class RecordingSemanticMemory {
  stored: MemoryEntryInput | undefined;

  async store(input: MemoryEntryInput) {
    this.stored = input;

    return {
      id: "drawer-document-1",
      body: input.body
    };
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}

class ThrowingSemanticMemory {
  async store(): Promise<never> {
    throw new Error("semantic unavailable");
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}
