import { describe, expect, it } from "vitest";

import { RegisterDocumentUseCase } from "../../../../src/application/use-cases/documents/register-document.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../../src/ports/document-repository-port.js";
import type {
  DocumentStoragePort,
  ResolveDocumentInput,
  ResolvedDocument,
  UploadDocumentInput
} from "../../../../src/ports/document-storage-port.js";

describe("RegisterDocumentUseCase", () => {
  it("resolves an external document and stores a local document record", async () => {
    const repository = new RecordingDocumentRepository();
    const storage = new StubDocumentStorage();
    const useCase = new RegisterDocumentUseCase({
      repository,
      storage,
      generateId: () => "document-1",
      now: () => new Date("2026-07-14T08:00:00.000Z")
    });

    await expect(
      useCase.execute({
        externalIdOrUrl: "https://drive.google.com/file/d/abc",
        documentType: "identity",
        subjectId: "max"
      })
    ).resolves.toEqual({
      status: "registered",
      document: {
        id: "document-1",
        provider: "google_drive",
        externalId: "drive-abc",
        name: "Passport.pdf",
        url: "https://drive.google.com/file/d/abc",
        documentType: "identity",
        subjectId: "max",
        status: "registered",
        createdAt: new Date("2026-07-14T08:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:00:00.000Z")
      }
    });
    expect(storage.seenInput).toEqual({
      externalIdOrUrl: "https://drive.google.com/file/d/abc"
    });
    expect(repository.saved).toEqual({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/abc",
      documentType: "identity",
      subjectId: "max",
      status: "registered",
      createdAt: new Date("2026-07-14T08:00:00.000Z"),
      updatedAt: new Date("2026-07-14T08:00:00.000Z")
    });
  });

  it("updates an existing local record for the same external document", async () => {
    const repository = new RecordingDocumentRepository(
      documentRecord({
        id: "document-existing",
        name: "Old name.pdf",
        url: "https://drive.google.com/file/d/old"
      })
    );
    const useCase = new RegisterDocumentUseCase({
      repository,
      storage: new StubDocumentStorage({
        name: "New name.pdf",
        url: "https://drive.google.com/file/d/new"
      }),
      generateId: () => "document-new",
      now: () => new Date("2026-07-14T08:30:00.000Z")
    });

    await expect(
      useCase.execute({
        externalIdOrUrl: "drive-abc",
        documentType: "travel",
        subjectId: "family"
      })
    ).resolves.toEqual({
      status: "registered",
      document: {
        id: "document-existing",
        provider: "google_drive",
        externalId: "drive-abc",
        name: "New name.pdf",
        url: "https://drive.google.com/file/d/new",
        documentType: "travel",
        subjectId: "family",
        status: "registered",
        createdAt: new Date("2026-07-14T07:00:00.000Z"),
        updatedAt: new Date("2026-07-14T08:30:00.000Z")
      }
    });
    expect(repository.saved?.id).toBe("document-existing");
    expect(repository.saved?.createdAt).toEqual(
      new Date("2026-07-14T07:00:00.000Z")
    );
  });

  it("preserves existing metadata when re-registering without new metadata", async () => {
    const repository = new RecordingDocumentRepository(
      documentRecord({
        id: "document-existing",
        name: "Old name.pdf",
        url: "https://drive.google.com/file/d/old"
      })
    );
    const useCase = new RegisterDocumentUseCase({
      repository,
      storage: new StubDocumentStorage({
        name: "New name.pdf",
        url: "https://drive.google.com/file/d/new"
      }),
      generateId: () => "document-new",
      now: () => new Date("2026-07-14T08:30:00.000Z")
    });

    await expect(
      useCase.execute({
        externalIdOrUrl: "drive-abc"
      })
    ).resolves.toEqual({
      status: "registered",
      document: expect.objectContaining({
        id: "document-existing",
        documentType: "identity",
        subjectId: "max"
      })
    });
  });
});

class StubDocumentStorage implements DocumentStoragePort {
  seenInput: ResolveDocumentInput | undefined;

  constructor(
    private readonly resolved: {
      readonly name?: string;
      readonly url?: string;
    } = {}
  ) {}

  async resolveDocument(input: ResolveDocumentInput) {
    this.seenInput = input;

    return {
      externalId: "drive-abc",
      name: this.resolved.name ?? "Passport.pdf",
      url: this.resolved.url ?? "https://drive.google.com/file/d/abc"
    };
  }

  async uploadDocument(_input: UploadDocumentInput): Promise<ResolvedDocument> {
    throw new Error("should not upload document");
  }

  async moveDocument(): Promise<{ readonly externalId: string }> {
    throw new Error("should not move document");
  }

  async deleteDocument(): Promise<void> {
    throw new Error("should not delete document");
  }
}

class RecordingDocumentRepository implements DocumentRepositoryPort {
  saved: DocumentRecord | undefined;

  constructor(private readonly existing?: DocumentRecord) {}

  async saveDocument(document: DocumentRecord): Promise<void> {
    this.saved = document;
  }

  async findDocumentByExternalId(
    provider: DocumentRecord["provider"],
    externalId: string
  ): Promise<DocumentRecord | undefined> {
    if (
      this.existing?.provider === provider &&
      this.existing.externalId === externalId
    ) {
      return this.existing;
    }

    return undefined;
  }

  async findDocumentsByIds(): Promise<readonly DocumentRecord[]> {
    throw new Error("should not find by ids");
  }

  async searchDocuments(): Promise<readonly DocumentRecord[]> {
    throw new Error("should not search documents");
  }
}

function documentRecord(
  overrides: Pick<DocumentRecord, "id" | "name" | "url">
): DocumentRecord {
  return {
    id: overrides.id,
    provider: "google_drive",
    externalId: "drive-abc",
    name: overrides.name,
    url: overrides.url,
    documentType: "identity",
    subjectId: "max",
    status: "registered",
    createdAt: new Date("2026-07-14T07:00:00.000Z"),
    updatedAt: new Date("2026-07-14T07:00:00.000Z")
  };
}
