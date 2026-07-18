import { describe, expect, it } from "vitest";

import { StoreInboundFileUseCase } from "../../../../src/application/use-cases/file-inbox/store-inbound-file.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { FileInboxRepositoryPort } from "../../../../src/ports/file-inbox-repository-port.js";
import type { FileStoragePort } from "../../../../src/ports/file-storage-port.js";

describe("StoreInboundFileUseCase", () => {
  it("stores bytes and persists file inbox metadata", async () => {
    const savedRecords: FileInboxRecord[] = [];
    const useCase = new StoreInboundFileUseCase({
      fileStorage: {
        async storeFile(input) {
          expect(input).toEqual({
            fileName: "report.pdf",
            mimeType: "application/pdf",
            bytes: new Uint8Array([1, 2, 3])
          });

          return {
            id: "stored-file-1",
            path: "inbox/file-1/report.pdf",
            sizeBytes: 3
          };
        }
      } satisfies FileStoragePort,
      repository: {
        async saveFileInboxRecord(record) {
          savedRecords.push(record);
        },
        async findFileInboxRecordById() {
          return undefined;
        },
        async findLatestFileInboxRecordByOriginalFileName() {
          return undefined;
        },
        async deleteFileInboxRecordById() {
          throw new Error("should not delete");
        }
      } satisfies FileInboxRepositoryPort,
      generateId: () => "file-inbox-1",
      now: () => new Date("2026-07-03T11:00:00.000Z")
    });

    const record = await useCase.execute({
      fileName: "report.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
      receivedAt: new Date("2026-07-03T10:59:00.000Z")
    });

    expect(record).toEqual({
      status: "stored",
      record: {
        id: "file-inbox-1",
        originalFileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageId: "stored-file-1",
        storagePath: "inbox/file-1/report.pdf",
        receivedAt: new Date("2026-07-03T10:59:00.000Z"),
        createdAt: new Date("2026-07-03T11:00:00.000Z")
      }
    });
    expect(savedRecords).toEqual([
      {
        id: "file-inbox-1",
        originalFileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        storageId: "stored-file-1",
        storagePath: "inbox/file-1/report.pdf",
        receivedAt: new Date("2026-07-03T10:59:00.000Z"),
        createdAt: new Date("2026-07-03T11:00:00.000Z")
      }
    ]);
  });

  it("does not store bytes when the original filename already exists", async () => {
    const existingRecord: FileInboxRecord = {
      id: "file-inbox-existing",
      originalFileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      storageId: "stored-existing",
      storagePath: "inbox/existing/report.pdf",
      receivedAt: new Date("2026-07-03T10:00:00.000Z"),
      createdAt: new Date("2026-07-03T10:00:01.000Z")
    };
    const useCase = new StoreInboundFileUseCase({
      fileStorage: {
        async storeFile() {
          throw new Error("should not store duplicate bytes");
        }
      } satisfies FileStoragePort,
      repository: {
        async saveFileInboxRecord() {
          throw new Error("should not save duplicate metadata");
        },
        async findFileInboxRecordById() {
          return undefined;
        },
        async findLatestFileInboxRecordByOriginalFileName(fileName) {
          return fileName === "report.pdf" ? existingRecord : undefined;
        },
        async deleteFileInboxRecordById() {
          throw new Error("should not delete");
        }
      } satisfies FileInboxRepositoryPort,
      generateId: () => "file-inbox-1",
      now: () => new Date("2026-07-03T11:00:00.000Z")
    });

    await expect(
      useCase.execute({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        receivedAt: new Date("2026-07-03T10:59:00.000Z")
      })
    ).resolves.toEqual({
      status: "duplicate",
      fileName: "report.pdf",
      existingRecord
    });
  });
});
