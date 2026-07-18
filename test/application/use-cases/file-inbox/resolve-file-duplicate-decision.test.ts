import { describe, expect, it } from "vitest";

import { ResolveFileDuplicateDecisionUseCase } from "../../../../src/application/use-cases/file-inbox/resolve-file-duplicate-decision.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { AttachmentDownloadPort } from "../../../../src/ports/attachment-download-port.js";
import type { FileInboxRepositoryPort } from "../../../../src/ports/file-inbox-repository-port.js";
import type { FileStoragePort } from "../../../../src/ports/file-storage-port.js";

const existingRecord: FileInboxRecord = {
  id: "file-existing",
  originalFileName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
  storageId: "storage-old",
  storagePath: "inbox/old/report.pdf",
  receivedAt: new Date("2026-07-02T19:00:00.000Z"),
  createdAt: new Date("2026-07-02T19:00:01.000Z")
};

const pending = {
  chatId: "chat-owner",
  actorId: "actor-owner",
  fileName: "report.pdf",
  suggestedCopyName: "report (2).pdf",
  existingRecordId: "file-existing",
  provider: "telegram",
  receivedAt: new Date("2026-07-02T20:00:00.000Z"),
  sourceAttachment: {
    id: "attachment-1",
    providerFileId: "telegram-file-1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10
  },
  createdAt: new Date("2026-07-02T20:00:01.000Z"),
  expiresAt: new Date("2026-07-02T20:30:00.000Z")
};

describe("ResolveFileDuplicateDecisionUseCase", () => {
  it("stores a copy with the suggested copy name", async () => {
    const savedRecords: FileInboxRecord[] = [];
    const downloader = new RecordingDownloader();
    const storage = new RecordingStorage("storage-copy", "inbox/copy/report_2.pdf");
    const useCase = new ResolveFileDuplicateDecisionUseCase({
      attachmentDownloader: downloader,
      fileStorage: storage,
      repository: repository(savedRecords),
      generateId: () => "file-copy",
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({ decision: "copy", pending })
    ).resolves.toEqual({
      status: "copied",
      record: {
        id: "file-copy",
        originalFileName: "report (2).pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageId: "storage-copy",
        storagePath: "inbox/copy/report_2.pdf",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        createdAt: new Date("2026-07-02T20:05:00.000Z")
      }
    });
    expect(downloader.seenInput).toEqual({
      provider: "telegram",
      providerFileId: "telegram-file-1",
      fileName: "report (2).pdf",
      mimeType: "application/pdf",
      sizeBytes: 10
    });
    expect(storage.seenInput).toEqual({
      fileName: "report (2).pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3])
    });
    expect(savedRecords).toHaveLength(1);
  });

  it("overwrites the existing record while preserving id and createdAt", async () => {
    const savedRecords: FileInboxRecord[] = [];
    const useCase = new ResolveFileDuplicateDecisionUseCase({
      attachmentDownloader: new RecordingDownloader(),
      fileStorage: new RecordingStorage("storage-new", "inbox/new/report.pdf"),
      repository: repository(savedRecords),
      generateId: () => "should-not-be-used",
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({ decision: "overwrite", pending })
    ).resolves.toEqual({
      status: "overwritten",
      record: {
        id: "file-existing",
        originalFileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageId: "storage-new",
        storagePath: "inbox/new/report.pdf",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        createdAt: new Date("2026-07-02T19:00:01.000Z")
      }
    });
    expect(savedRecords).toEqual([
      {
        id: "file-existing",
        originalFileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageId: "storage-new",
        storagePath: "inbox/new/report.pdf",
        receivedAt: new Date("2026-07-02T20:00:00.000Z"),
        createdAt: new Date("2026-07-02T19:00:01.000Z")
      }
    ]);
  });

  it("returns unavailable when old pending state lacks source attachment data", async () => {
    const useCase = new ResolveFileDuplicateDecisionUseCase({
      attachmentDownloader: new RecordingDownloader(),
      fileStorage: new RecordingStorage("storage-new", "inbox/new/report.pdf"),
      repository: repository([]),
      generateId: () => "file-copy",
      now: () => new Date("2026-07-02T20:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "copy",
        pending: {
          chatId: "chat-owner",
          actorId: "actor-owner",
          fileName: "report.pdf",
          suggestedCopyName: "report (2).pdf",
          existingRecordId: "file-existing",
          createdAt: new Date("2026-07-02T20:00:01.000Z"),
          expiresAt: new Date("2026-07-02T20:30:00.000Z")
        }
      })
    ).resolves.toEqual({
      status: "unavailable",
      reason: "missing_source_attachment"
    });
  });
});

class RecordingDownloader implements AttachmentDownloadPort {
  seenInput: Parameters<AttachmentDownloadPort["downloadAttachment"]>[0] | undefined;

  async downloadAttachment(input: Parameters<AttachmentDownloadPort["downloadAttachment"]>[0]) {
    this.seenInput = input;

    return {
      fileName: input.fileName ?? "downloaded.pdf",
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
      bytes: new Uint8Array([1, 2, 3])
    };
  }
}

class RecordingStorage implements FileStoragePort {
  seenInput: Parameters<FileStoragePort["storeFile"]>[0] | undefined;

  constructor(
    private readonly id: string,
    private readonly path: string
  ) {}

  async storeFile(input: Parameters<FileStoragePort["storeFile"]>[0]) {
    this.seenInput = input;

    return {
      id: this.id,
      path: this.path,
      sizeBytes: input.bytes.byteLength
    };
  }
}

function repository(savedRecords: FileInboxRecord[]): FileInboxRepositoryPort {
  return {
    async saveFileInboxRecord(record) {
      savedRecords.push(record);
    },
    async findFileInboxRecordById(id) {
      return id === existingRecord.id ? existingRecord : undefined;
    },
    async findLatestFileInboxRecordByOriginalFileName() {
      return undefined;
    },
    async deleteFileInboxRecordById() {
      throw new Error("should not delete");
    }
  };
}
