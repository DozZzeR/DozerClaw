import { describe, expect, it } from "vitest";

import { StoreMessageAttachmentsUseCase } from "../../../../src/application/use-cases/file-inbox/store-message-attachments.js";
import type { FileInboxRecord } from "../../../../src/core/domain/file-inbox/file-inbox-record.js";
import type { AttachmentDownloadPort } from "../../../../src/ports/attachment-download-port.js";

describe("StoreMessageAttachmentsUseCase", () => {
  it("downloads and stores message attachments", async () => {
    const storedInputs: unknown[] = [];
    const record: FileInboxRecord = {
      id: "file-inbox-1",
      originalFileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 3,
      storageId: "stored-file-1",
      storagePath: "inbox/file/report.pdf",
      receivedAt: new Date("2026-07-03T12:00:00.000Z"),
      createdAt: new Date("2026-07-03T12:00:01.000Z")
    };
    const useCase = new StoreMessageAttachmentsUseCase({
      attachmentDownloader: {
        async downloadAttachment(input) {
          expect(input).toEqual({
            provider: "telegram",
            providerFileId: "telegram-file-1",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3
          });

          return {
            fileName: "report.pdf",
            mimeType: "application/pdf",
            bytes: new Uint8Array([1, 2, 3])
          };
        }
      } satisfies AttachmentDownloadPort,
      fileStore: {
        async execute(input) {
          storedInputs.push(input);

          return record;
        }
      }
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        receivedAt: new Date("2026-07-03T12:00:00.000Z"),
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            sizeBytes: 3
          }
        ]
      })
    ).resolves.toEqual([record]);
    expect(storedInputs).toEqual([
      {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3]),
        receivedAt: new Date("2026-07-03T12:00:00.000Z")
      }
    ]);
  });

  it("skips attachments without provider file ids", async () => {
    const useCase = new StoreMessageAttachmentsUseCase({
      attachmentDownloader: {
        async downloadAttachment() {
          throw new Error("should not download");
        }
      } satisfies AttachmentDownloadPort,
      fileStore: {
        async execute() {
          throw new Error("should not store");
        }
      }
    });

    await expect(
      useCase.execute({
        provider: "telegram",
        receivedAt: new Date("2026-07-03T12:00:00.000Z"),
        attachments: [
          {
            id: "attachment-1",
            fileName: "report.pdf"
          }
        ]
      })
    ).resolves.toEqual([]);
  });
});
