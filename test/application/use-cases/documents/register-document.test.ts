import { describe, expect, it } from "vitest";

import { RegisterDocumentUseCase } from "../../../../src/application/use-cases/documents/register-document.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type { DocumentRepositoryPort } from "../../../../src/ports/document-repository-port.js";
import type {
  DocumentStoragePort,
  ResolveDocumentInput
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
        externalIdOrUrl: "https://drive.google.com/file/d/abc"
      })
    ).resolves.toEqual({
      status: "registered",
      document: {
        id: "document-1",
        provider: "google_drive",
        externalId: "drive-abc",
        name: "Passport.pdf",
        url: "https://drive.google.com/file/d/abc",
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
        externalIdOrUrl: "drive-abc"
      })
    ).resolves.toEqual({
      status: "registered",
      document: {
        id: "document-existing",
        provider: "google_drive",
        externalId: "drive-abc",
        name: "New name.pdf",
        url: "https://drive.google.com/file/d/new",
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
    status: "registered",
    createdAt: new Date("2026-07-14T07:00:00.000Z"),
    updatedAt: new Date("2026-07-14T07:00:00.000Z")
  };
}
