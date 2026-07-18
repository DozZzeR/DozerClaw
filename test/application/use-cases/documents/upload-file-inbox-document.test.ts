import { describe, expect, it } from "vitest";

import { UploadFileInboxDocumentUseCase } from "../../../../src/application/use-cases/documents/upload-file-inbox-document.js";
import type { DocumentRecord } from "../../../../src/core/domain/documents/document-record.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";

describe("UploadFileInboxDocumentUseCase", () => {
  it("uploads an existing local inbox file to document storage and registers it", async () => {
    const fileRecord: FileInboxRecord = {
      id: "file-1",
      originalFileName: "card.pdf",
      mimeType: "application/pdf",
      sizeBytes: 7,
      storageId: "storage-1",
      storagePath: "/tmp/card.pdf",
      receivedAt: new Date("2026-07-02T19:00:00.000Z"),
      createdAt: new Date("2026-07-02T19:00:00.000Z")
    };
    const repository = new FakeFileInboxRepository(fileRecord);
    const fileStorage = new FakeFileStorageReader(new Uint8Array([1, 2, 3]));
    const documentStorage = new FakeDocumentStorage();
    const documentRepository = new FakeDocumentRepository();
    const useCase = new UploadFileInboxDocumentUseCase({
      fileInboxRepository: repository,
      fileStorage,
      documentStorage,
      documentRepository,
      generateId: () => "document-1",
      now: () => new Date("2026-07-02T20:00:00.000Z")
    });

    await expect(
      useCase.execute({
        fileInboxRecordId: "file-1",
        documentType: "identity",
        subjectId: "alex"
      })
    ).resolves.toEqual({
      status: "uploaded",
      document: {
        id: "document-1",
        provider: "google_drive",
        externalId: "drive-1",
        name: "card.pdf",
        url: "https://drive.google.com/file/d/drive-1",
        documentType: "identity",
        subjectId: "alex",
        status: "registered",
        createdAt: new Date("2026-07-02T20:00:00.000Z"),
        updatedAt: new Date("2026-07-02T20:00:00.000Z")
      }
    });
    expect(fileStorage.seenInput).toEqual({ path: "/tmp/card.pdf" });
    expect(documentStorage.seenInput).toEqual({
      fileName: "card.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3])
    });
    expect(documentRepository.saved).toEqual({
      id: "document-1",
      provider: "google_drive",
      externalId: "drive-1",
      name: "card.pdf",
      url: "https://drive.google.com/file/d/drive-1",
      documentType: "identity",
      subjectId: "alex",
      status: "registered",
      createdAt: new Date("2026-07-02T20:00:00.000Z"),
      updatedAt: new Date("2026-07-02T20:00:00.000Z")
    });
  });

  it("reports not_found when the local inbox record does not exist", async () => {
    const useCase = new UploadFileInboxDocumentUseCase({
      fileInboxRepository: new FakeFileInboxRepository(undefined),
      fileStorage: new FakeFileStorageReader(new Uint8Array()),
      documentStorage: new FakeDocumentStorage(),
      documentRepository: new FakeDocumentRepository(),
      generateId: () => "document-1",
      now: () => new Date("2026-07-02T20:00:00.000Z")
    });

    await expect(
      useCase.execute({ fileInboxRecordId: "missing-file" })
    ).resolves.toEqual({
      status: "not_found"
    });
  });
});

class FakeFileInboxRepository {
  constructor(private readonly record: FileInboxRecord | undefined) {}

  async saveFileInboxRecord(): Promise<void> {
    throw new Error("should not be called");
  }

  async findFileInboxRecordById(): Promise<FileInboxRecord | undefined> {
    return this.record;
  }

  async findLatestFileInboxRecordByOriginalFileName(): Promise<
    FileInboxRecord | undefined
  > {
    throw new Error("should not be called");
  }
}

class FakeFileStorageReader {
  seenInput: { readonly path: string } | undefined;

  constructor(private readonly bytes: Uint8Array) {}

  async readFile(input: { readonly path: string }): Promise<Uint8Array> {
    this.seenInput = input;

    return this.bytes;
  }
}

class FakeDocumentStorage {
  seenInput:
    | {
        readonly fileName: string;
        readonly mimeType?: string;
        readonly bytes: Uint8Array;
      }
    | undefined;

  async resolveDocument(): Promise<never> {
    throw new Error("should not be called");
  }

  async uploadDocument(input: NonNullable<FakeDocumentStorage["seenInput"]>) {
    this.seenInput = input;

    return {
      externalId: "drive-1",
      name: input.fileName,
      url: "https://drive.google.com/file/d/drive-1"
    };
  }

  async moveDocument(): Promise<never> {
    throw new Error("should not be called");
  }

  async deleteDocument(): Promise<never> {
    throw new Error("should not be called");
  }
}

class FakeDocumentRepository {
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
